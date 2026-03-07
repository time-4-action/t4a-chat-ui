import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserMemory } from "@/models/user-memory";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { NextRequest, NextResponse } from "next/server";

const SECTIONS = ["workContext", "personalContext", "topOfMind", "recentActivity"] as const;
type Section = typeof SECTIONS[number];

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const memory = await UserMemory.findOne({ userId: session.user.sub });
  return NextResponse.json({
    workContext: memory?.workContext ?? "",
    personalContext: memory?.personalContext ?? "",
    topOfMind: memory?.topOfMind ?? "",
    recentActivity: memory?.recentActivity ?? "",
    updatedAt: memory?.updatedAt ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { section, all } = await req.json();
  await connectDB();

  if (all) {
    await UserMemory.findOneAndUpdate(
      { userId: session.user.sub },
      { $set: { workContext: "", personalContext: "", topOfMind: "", recentActivity: "", updatedAt: new Date() } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  }

  if (!SECTIONS.includes(section as Section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  await UserMemory.findOneAndUpdate(
    { userId: session.user.sub },
    { $set: { [section]: "", updatedAt: new Date() } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text: importedText } = await req.json();
  if (!importedText?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  await connectDB();
  const existing = await UserMemory.findOne({ userId: session.user.sub });
  const current = {
    workContext: existing?.workContext ?? "",
    personalContext: existing?.personalContext ?? "",
    topOfMind: existing?.topOfMind ?? "",
    recentActivity: existing?.recentActivity ?? "",
  };

  const prompt = `You are importing memory exported from another AI assistant (such as Claude, ChatGPT, or similar) into a structured memory system. The export may use any format — section headers, bullet points, date-stamped entries, prose, etc.

Current memory (already stored — preserve and merge, do not erase):
${JSON.stringify(current, null, 2)}

Imported text:
${importedText}

Map the imported content into these four sections, merging with existing memory:
- workContext: professional role, company, projects, tech stack, career background
- personalContext: name, location, languages, hobbies, personal interests, relationships
- topOfMind: current focus areas, active projects, things being actively built or solved
- recentActivity: recent tasks accomplished, problems solved, things worked on lately

Rules:
- Write in third person (e.g. "The user..." or use their name if known)
- Each section: 2–5 sentences of concise prose — no bullet points
- Merge new info naturally with existing text; do not duplicate
- If a section has nothing relevant, keep its existing value unchanged
- Instructions/preferences from the import go into customInstructions — ignore them here, focus only on factual context

Return ONLY valid JSON with exactly these keys:
{"workContext":"...","personalContext":"...","topOfMind":"...","recentActivity":"..."}`;

  const { text } = await generateText({
    model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })("claude-haiku-4-5-20251001"),
    prompt,
  });

  let updated: typeof current;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "Parse failed" }, { status: 500 });
    updated = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }

  await UserMemory.findOneAndUpdate(
    { userId: session.user.sub },
    {
      $set: {
        workContext: updated.workContext || current.workContext,
        personalContext: updated.personalContext || current.personalContext,
        topOfMind: updated.topOfMind || current.topOfMind,
        recentActivity: updated.recentActivity || current.recentActivity,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return NextResponse.json({
    workContext: updated.workContext || current.workContext,
    personalContext: updated.personalContext || current.personalContext,
    topOfMind: updated.topOfMind || current.topOfMind,
    recentActivity: updated.recentActivity || current.recentActivity,
  });
}
