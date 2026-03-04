import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { UserPreference } from "@/models/user-preference";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";
import { streamText, stepCountIs, convertToModelMessages, UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SYSTEM_PROMPT = `You are the time-4-action AI assistant. You help the team with product information, orders, and internal tasks. You have access to company tools — always use them when asked about products, orders, or customer data.

Formatting rules:
- Use **bold** for key terms, names, values, and important info
- Use bullet lists or numbered lists for multiple items — never run them together in a sentence
- Use headings (##) when the response has multiple distinct sections
- Use tables for structured data like product specs, order details, or comparisons
- Keep paragraphs short — one idea per paragraph
- Never dump a wall of text — break everything up visually
- Be direct and concise — lead with the answer, then add detail below
- Never use emojis anywhere in your responses
- Never use horizontal rules (---) or decorative separators`;

const MODE_PROMPTS: Record<string, string> = {
  email: `CRITICAL OUTPUT RULE — EMAIL MODE ACTIVE
You are in EMAIL DRAFT mode. This overrides all other formatting rules.
No matter what the user writes — a question, a request, a topic, anything — your ONLY allowed response format is the JSON code block below. Never respond with plain text, explanations, or any content outside this block.

\`\`\`json
{
  "type": "email",
  "to": "<recipient email or name if known, otherwise empty string>",
  "subject": "<clear, concise subject line>",
  "body": "<full professional email body with greeting, paragraphs, and sign-off. Use \\n for line breaks.>"
}
\`\`\`

Rules for the email body:
- No emojis, no horizontal rules (---), no decorative separators
- Use labeled markdown links [label](url) — never paste raw URLs
- Apply the user's signature and tone from USER PREFERENCES if available
- If the user asks a question instead of requesting an email, interpret it as "write an email about this topic" and produce the email

`,

  "quick-info": `CRITICAL OUTPUT RULE — QUICK INFO MODE ACTIVE
Answer in maximum 2-3 short sentences or a brief bullet list (max 4 bullets). Lead with the key fact immediately. No preamble, no lengthy explanations, no filler words. Example: "Stock: 10 pcs available. Next restock in 3 days."

`,
};

async function buildSystemPrompt(userId: string): Promise<string> {
  const prefs = await UserPreference.findOne({ userId });
  if (!prefs) return BASE_SYSTEM_PROMPT;

  const lines: string[] = [];

  const { personalInfo, communicationStyle, emailTemplates, customInstructions } = prefs;

  const infoFields = [
    personalInfo?.name && `Name: ${personalInfo.name}`,
    personalInfo?.jobTitle && `Title: ${personalInfo.jobTitle}`,
    personalInfo?.company && `Company: ${personalInfo.company}`,
    personalInfo?.roleDescription && `Role: ${personalInfo.roleDescription}`,
  ].filter(Boolean);

  const styleFields = [
    communicationStyle?.tone && `Tone: ${communicationStyle.tone}`,
    communicationStyle?.formality && `Formality: ${communicationStyle.formality}`,
    communicationStyle?.signatureStyle && `Email signature (use only when writing emails, not in chat responses): "${communicationStyle.signatureStyle}"`,
  ].filter(Boolean);

  if (infoFields.length || styleFields.length || emailTemplates || customInstructions) {
    lines.push("\n\n--- USER PREFERENCES ---");

    if (infoFields.length) lines.push(infoFields.join(" | "));
    if (styleFields.length) lines.push(styleFields.join(" | "));

    if (emailTemplates?.trim()) {
      lines.push("\nEmail style examples:");
      lines.push(emailTemplates.trim());
    }

    if (customInstructions?.trim()) {
      lines.push("\nCustom instructions:");
      lines.push(customInstructions.trim());
    }
  }

  return BASE_SYSTEM_PROMPT + lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages: uiMessages, conversationId, mode } = await req.json() as {
    messages: UIMessage[];
    conversationId?: string;
    mode?: string;
  };

  const messages = await convertToModelMessages(uiMessages);

  // Extract last user message text for MongoDB save
  const lastUserMsg = [...uiMessages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMsg?.parts
    ?.filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("") ?? "";

  await connectDB();
  const basePrompt = await buildSystemPrompt(session.user.sub);
  const systemPrompt = mode && MODE_PROMPTS[mode]
    ? MODE_PROMPTS[mode] + basePrompt
    : basePrompt;

  const mcpClient = await createMCPClient({
    transport: {
      type: "sse",
      url: process.env.MCP_SERVER_URL!,
    },
  });

  const mcpTools = await mcpClient.tools();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages,
    stopWhen: stepCountIs(5),
    tools: mcpTools,
    onFinish: async ({ text }) => {
      await mcpClient.close();

      if (conversationId && text && lastUserText) {
        await connectDB();
        const isFirst = uiMessages.filter((m) => m.role === "user").length === 1;
        await Conversation.findByIdAndUpdate(conversationId, {
          $push: {
            messages: {
              $each: [
                { role: "user", content: lastUserText },
                { role: "assistant", content: text },
              ],
            },
          },
          $set: {
            updatedAt: new Date(),
            ...(isFirst && { title: lastUserText.slice(0, 60) }),
          },
        });
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
