import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { UserUsage } from "@/models/user-usage";
import { UserPreference } from "@/models/user-preference";
import { UserMemory } from "@/models/user-memory";
import { UserTone } from "@/models/user-tone";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";
import { streamText, generateText, stepCountIs, convertToModelMessages, UIMessage, ToolSet } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODEL, ModelId, calculateRequestCost } from "@/lib/models";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, "")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<u>(.*?)<\/u>/gi, "$1")
    .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
- Never use horizontal rules (---) or decorative separators

Memory rules:
- You have persistent memory of this user across conversations — never say otherwise
- Never explain, reference, or acknowledge how your memory system works internally
- Never say things like "I've noted this", "I'll remember that", "this will be reflected going forward", or "depending on how the memory system is configured"
- When a user tells you something about themselves, simply acknowledge it naturally and move on — treat it as already known
- If asked to update or remember something, just confirm it briefly ("Got it, 19.") and continue`;

const MODE_PROMPTS: Record<string, string> = {
  email: `CRITICAL OUTPUT RULE — EMAIL MODE ACTIVE
You are in EMAIL DRAFT mode. This overrides all other formatting rules.
No matter what the user writes — a question, a request, a topic, anything — your ONLY allowed response format is the JSON code block below. Never respond with plain text, explanations, or any content outside this block.

\`\`\`json
{
  "type": "email",
  "to": "<recipient email or name if known, otherwise empty string>",
  "subject": "<clear, concise subject line>",
  "body": "<email body: opening greeting + content paragraphs only. Do NOT write any closing line, sign-off, 'Best regards', or signature — those are automatically appended from the user's profile. Use \\n for line breaks.>"
}
\`\`\`

Rules for the email body:
- End the body after the last content paragraph — no closing whatsoever
- No emojis, no horizontal rules (---), no decorative separators
- Use labeled markdown links [label](url) — never paste raw URLs
- Apply the user's tone and style from USER PREFERENCES if available
- If the user asks a question instead of requesting an email, interpret it as "write an email about this topic" and produce the email

`,

  "quick-info": `CRITICAL OUTPUT RULE — QUICK INFO MODE ACTIVE
Answer in maximum 2-3 short sentences or a brief bullet list (max 4 bullets). Lead with the key fact immediately. No preamble, no lengthy explanations, no filler words. Example: "Stock: 10 pcs available. Next restock in 3 days."

`,
};

async function buildSystemPrompt(userId: string, toneId?: string): Promise<string> {
  const prefs = await UserPreference.findOne({ userId });

  const lines: string[] = [];

  if (prefs) {
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
      communicationStyle?.signatureStyle && `Email signature style context (DO NOT include the signature in the email body — it is automatically appended by the app): "${htmlToMarkdown(communicationStyle.signatureStyle)}"`,
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
  }

  const memory = await UserMemory.findOne({ userId });
  const memorySections = [
    memory?.workContext && `Work context:\n${memory.workContext}`,
    memory?.personalContext && `Personal context:\n${memory.personalContext}`,
    memory?.topOfMind && `Top of mind:\n${memory.topOfMind}`,
    memory?.recentActivity && `Recent activity:\n${memory.recentActivity}`,
  ].filter(Boolean);

  if (memorySections.length) {
    lines.push("\n\n--- MEMORY ---");
    lines.push("What you know about this user from past conversations:");
    memorySections.forEach((s) => lines.push(`\n${s}`));
  }

  const activeTone = toneId
    ? await UserTone.findOne({ _id: toneId, userId })
    : await UserTone.findOne({ userId, isActive: true });
  if (activeTone?.generatedPrompt) {
    lines.push("\n\n--- ACTIVE TONE ---");
    lines.push(`The user has activated a custom writing tone called "${activeTone.name}". Apply this tone to all your responses.`);
    if (activeTone.characteristics) {
      lines.push(`Style characteristics: ${activeTone.characteristics}`);
    }
    lines.push(`\nTone instructions:\n${activeTone.generatedPrompt}`);
  }

  return BASE_SYSTEM_PROMPT + lines.join("\n");
}

interface MemorySummary {
  workContext: string;
  personalContext: string;
  topOfMind: string;
  recentActivity: string;
}

async function updateMemorySummary(userId: string, userMsg: string, assistantMsg: string) {
  if (!userMsg.trim() || !assistantMsg.trim()) return;

  await connectDB();
  const memory = await UserMemory.findOne({ userId });
  const current: MemorySummary = {
    workContext: memory?.workContext ?? "",
    personalContext: memory?.personalContext ?? "",
    topOfMind: memory?.topOfMind ?? "",
    recentActivity: memory?.recentActivity ?? "",
  };

  const prompt = `You maintain a persistent memory summary of a user based on their conversations with an AI assistant.

Current memory (JSON):
${JSON.stringify(current, null, 2)}

New conversation:
User: ${userMsg}
Assistant: ${assistantMsg}

Update the memory summary. Rules:
- Write in third person (e.g. "The user..." or use their name if known)
- Each section is 1-3 sentences — concise prose, not bullet points
- Merge new info naturally into existing text; do not duplicate
- Only update sections that are clearly relevant to the conversation
- Leave sections unchanged (keep their exact text) if nothing new applies
- workContext: professional role, projects, tech stack, company
- personalContext: location, languages, hobbies, personal details
- topOfMind: what they are currently focused on or building
- recentActivity: recent tasks, problems solved, things worked on

Return ONLY valid JSON with these exact keys:
{"workContext":"...","personalContext":"...","topOfMind":"...","recentActivity":"..."}`;

  const { text } = await generateText({
    model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })("claude-haiku-4-5-20251001"),
    prompt,
  });

  let updated: MemorySummary;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;
    updated = JSON.parse(match[0]);
  } catch {
    return;
  }

  await UserMemory.findOneAndUpdate(
    { userId },
    {
      $set: {
        workContext: updated.workContext ?? current.workContext,
        personalContext: updated.personalContext ?? current.personalContext,
        topOfMind: updated.topOfMind ?? current.topOfMind,
        recentActivity: updated.recentActivity ?? current.recentActivity,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

// Mark the last message's last content block with Anthropic cache_control.
// This caches the full prefix (tools + system + all prior messages) so subsequent
// turns pay only 10% of input price for already-seen tokens.
function withCacheControl(messages: any[]): any[] {
  if (!messages.length) return messages;
  const result = [...messages];
  const last = { ...result[result.length - 1] };

  if (typeof last.content === "string") {
    last.content = [{
      type: "text",
      text: last.content,
      experimental_providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } },
    }];
  } else if (Array.isArray(last.content) && last.content.length > 0) {
    const parts = [...last.content];
    parts[parts.length - 1] = {
      ...parts[parts.length - 1],
      experimental_providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } },
    };
    last.content = parts;
  }

  result[result.length - 1] = last;
  return result;
}

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages: uiMessages, conversationId, mode, model: requestedModel, toneId } = await req.json() as {
    messages: UIMessage[];
    conversationId?: string;
    mode?: string;
    model?: string;
    toneId?: string;
  };

  const modelId: ModelId = (requestedModel as ModelId) ?? DEFAULT_MODEL;

  const messages = withCacheControl(await convertToModelMessages(uiMessages));

  // Extract last user message text + files for MongoDB save
  const lastUserMsg = [...uiMessages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMsg?.parts
    ?.filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("") ?? "";

  const lastUserFiles = (lastUserMsg?.parts ?? [])
    .filter((p) => p.type === "file")
    .map((p) => {
      const fp = p as { type: "file"; mediaType: string; filename?: string; url: string };
      return {
        mediaType: fp.mediaType,
        filename: fp.filename ?? "",
        // Only store data URL for images — PDFs/docs can be huge base64 blobs
        url: fp.mediaType.startsWith("image/") ? fp.url : "",
      };
    });

  await connectDB();
  const basePrompt = await buildSystemPrompt(session.user.sub, toneId);
  const systemPrompt = mode && MODE_PROMPTS[mode]
    ? MODE_PROMPTS[mode] + basePrompt
    : basePrompt;

  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  let mcpTools: ToolSet = {};

  if (process.env.MCP_SERVER_URL) {
    try {
      mcpClient = await createMCPClient({
        transport: { type: "sse", url: process.env.MCP_SERVER_URL },
      });
      mcpTools = await mcpClient.tools();
    } catch (err) {
      console.warn("[chat] MCP unavailable, continuing without tools:", (err as Error).message);
      mcpClient = null;
      mcpTools = {};
    }
  }

  const result = streamText({
    model: anthropic(modelId),
    system: systemPrompt,
    messages,
    stopWhen: stepCountIs(5),
    ...(Object.keys(mcpTools).length > 0 && { tools: mcpTools }),
    onFinish: async ({ text, usage, steps }) => {
      console.log("[chat] usage:", JSON.stringify(usage));
      await mcpClient?.close();

      // Memory update — only when there's actual text exchange
      if (text && lastUserText) {
        updateMemorySummary(session.user.sub, lastUserText, text).catch(console.error);
      }

      if (conversationId && text) {
        await connectDB();
        const isFirst = uiMessages.filter((m) => m.role === "user").length === 1;

        // usage.inputTokens / outputTokens are the total across all steps in v6
        const inputTokens  = usage.inputTokens  ?? 0;
        const outputTokens = usage.outputTokens ?? 0;

        // Cache tokens live in per-step providerMetadata — sum across all steps
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;
        for (const step of steps) {
          const meta = (step.providerMetadata as any)?.anthropic;
          cacheReadTokens     += meta?.cacheReadInputTokens     ?? 0;
          cacheCreationTokens += meta?.cacheCreationInputTokens ?? 0;
        }

        console.log("[chat] tokens — input:", inputTokens, "output:", outputTokens, "cacheRead:", cacheReadTokens, "cacheCreate:", cacheCreationTokens);

        const reqCost = calculateRequestCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);

        // Conversation title: prefer user text, fall back to first attached filename
        const firstFileName = lastUserFiles[0]?.filename;
        const titleSource = lastUserText || (firstFileName ? `[File] ${firstFileName}` : "New Chat");

        await UserUsage.findOneAndUpdate(
          { userId: session.user.sub, modelId },
          { $inc: { totalCostUsd: reqCost, conversationCount: isFirst ? 1 : 0, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } },
          { upsert: true }
        );
        await Conversation.findByIdAndUpdate(conversationId, {
          $push: {
            messages: {
              $each: [
                { role: "user", content: lastUserText, files: lastUserFiles },
                { role: "assistant", content: text },
              ],
            },
          },
          $inc: { totalCostUsd: reqCost },
          $set: {
            updatedAt: new Date(),
            model: modelId,
            ...(isFirst && { title: titleSource.slice(0, 60) }),
          },
        });
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
