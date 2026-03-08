import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserTone } from "@/models/user-tone";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { NextRequest, NextResponse } from "next/server";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const tones = await UserTone.find({ userId: session.user.sub })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(tones);
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, tags, examples, customPrompt } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  await connectDB();

  let characteristics = "";
  let generatedPrompt = "";

  const analysisParts = [
    examples?.trim() && `Writing examples:\n${examples.trim()}`,
    tags?.length > 0 && `Style tags: ${(tags as string[]).join(", ")}`,
    customPrompt?.trim() && `Additional instructions:\n${customPrompt.trim()}`,
  ].filter(Boolean);

  if (analysisParts.length > 0) {
    try {
      const { text } = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        prompt: `Analyse the following writing samples and/or instructions to build a precise writing tone profile.

${analysisParts.join("\n\n")}

Return a JSON object with exactly these two keys:
{
  "characteristics": "2–3 sentences describing the key stylistic traits found: vocabulary level, sentence length and rhythm, formality, punctuation habits, directness, and any distinctive patterns.",
  "systemPrompt": "2–4 imperative sentences that instruct an AI to write in this exact style. Use active voice. Cover: formality level, sentence structure preference, vocabulary choices, and any distinctive stylistic patterns extracted from the examples."
}

Return ONLY the JSON object — no markdown, no extra text.`,
      });

      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        characteristics = parsed.characteristics ?? "";
        generatedPrompt = parsed.systemPrompt ?? "";
      }
    } catch (err) {
      console.error("[tones] Analysis failed:", err);
    }
  }

  // Combine AI-generated prompt with user's custom instructions
  const finalPrompt = [generatedPrompt, customPrompt?.trim()]
    .filter(Boolean)
    .join("\n\n");

  const tone = await UserTone.create({
    userId: session.user.sub,
    name: name.trim(),
    description: description?.trim() ?? "",
    tags: tags ?? [],
    examples: examples?.trim() ?? "",
    customPrompt: customPrompt?.trim() ?? "",
    characteristics,
    generatedPrompt: finalPrompt,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json(tone, { status: 201 });
}
