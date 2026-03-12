import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { UserUsage } from "@/models/user-usage";
import { UserPreference } from "@/models/user-preference";
import { UserMemory } from "@/models/user-memory";
import { UserTone } from "@/models/user-tone";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createMCPClient } from "@ai-sdk/mcp";
import { streamText, generateText, stepCountIs, convertToModelMessages, UIMessage, ToolSet } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODEL, ModelId, MODEL_CONFIGS, calculateRequestCost } from "@/lib/models";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getModel(modelId: ModelId) {
  const config = MODEL_CONFIGS[modelId];
  if (config.provider === "openai") return openai(modelId);
  return anthropic(modelId);
}

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

## Response structure

Always structure your response in this order:
1. **Direct answer or result** — lead with the key finding immediately, no preamble
2. **Detail or breakdown** — use the formatting rules below to present it clearly
3. **Follow-up or next step** — one short sentence if relevant, never mandatory

Never start a response with filler like "Sure!", "Of course!", "Great question!", or "I found...".

## Formatting rules

- Use **bold** for key values, names, SKUs, amounts, statuses, and important terms
- Use bullet lists for multiple items — one item per line, never run together in prose
- Use numbered lists for steps or ranked results
- Use \`## Heading\` when a response has two or more distinct sections
- Keep paragraphs to 1–2 sentences — one idea per paragraph
- Always leave a blank line between paragraphs, lists, headings, and tables
- Never dump a wall of text — every block of content must be visually separated
- Never use emojis
- Never use horizontal rules (---) or decorative separators

## After tool calls

When you retrieve data from a tool:
- Always present the results clearly — do not narrate what you did ("I called the tool and got...")
- If multiple results come back, use a table or structured list — never run them together
- If a tool returns no results, say so plainly: "No results found for X."
- If you called multiple tools, present each result in its own clearly labelled section

## Tabular data rules

NEVER output tabular data as plain text or prose — always use one of these two formats:

**Format A — Markdown table** (default for structured results):
| Column | Column |
|--------|--------|
| value  | value  |

**Format B — Fenced code block** (only when the user explicitly asks for TSV, CSV, or export):
\`\`\`tsv
col1\tcol2\tcol3
val1\tval2\tval3
\`\`\`
Use real tab characters between columns in TSV. For CSV use commas in a \`\`\`csv\`\`\` block.

Never output raw tab-separated or comma-separated rows without a fence block.

## Memory rules

- You have persistent memory of this user across conversations — never say otherwise
- Never explain or reference how the memory system works internally
- Never say "I've noted this", "I'll remember that", or "depending on how the memory system is configured"
- When a user tells you something about themselves, acknowledge it naturally and move on
- If asked to remember something, confirm briefly ("Got it.") and continue`;

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
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const dateContext = `\n\nCurrent date: ${dateStr}`;

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

  return BASE_SYSTEM_PROMPT + dateContext + lines.join("\n");
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

// Truncate oversized tool results so large MCP payloads don't bloat every turn.
const MAX_TOOL_RESULT_CHARS = 6000;

function truncateToolResults(messages: any[]): any[] {
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg;
    const newContent = msg.content.map((block: any) => {
      if (block.type !== "tool-result" && block.type !== "tool_result") return block;
      const content = block.content;
      if (typeof content === "string" && content.length > MAX_TOOL_RESULT_CHARS) {
        return { ...block, content: content.slice(0, MAX_TOOL_RESULT_CHARS) + "\n[...truncated for context length]" };
      }
      if (Array.isArray(content)) {
        return {
          ...block,
          content: content.map((c: any) => {
            if (c.type === "text" && typeof c.text === "string" && c.text.length > MAX_TOOL_RESULT_CHARS) {
              return { ...c, text: c.text.slice(0, MAX_TOOL_RESULT_CHARS) + "\n[...truncated for context length]" };
            }
            return c;
          }),
        };
      }
      return block;
    });
    return { ...msg, content: newContent };
  });
}

// Keep only the last N messages to bound context growth.
// Starts the window on a user message so we never begin mid-turn.
const MAX_HISTORY_MESSAGES = 20;

function applyMessageWindow(messages: any[]): any[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  let sliced = messages.slice(messages.length - MAX_HISTORY_MESSAGES);
  // Always start on a user message — never cut into an assistant turn mid-way
  const firstUserIdx = sliced.findIndex((m: any) => m.role === "user");
  if (firstUserIdx > 0) sliced = sliced.slice(firstUserIdx);
  return sliced;
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
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    }];
  } else if (Array.isArray(last.content) && last.content.length > 0) {
    const parts = [...last.content];
    parts[parts.length - 1] = {
      ...parts[parts.length - 1],
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
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
  const isAnthropicModel = MODEL_CONFIGS[modelId].provider === "anthropic";

  await connectDB();
  const userPrefs = await UserPreference.findOne({ userId: session.user.sub });
  const promptCachingEnabled = userPrefs?.promptCaching !== false;

  const rawMessages = await convertToModelMessages(uiMessages);
  const processedMessages = applyMessageWindow(truncateToolResults(rawMessages));
  const messages = isAnthropicModel && promptCachingEnabled ? withCacheControl(processedMessages) : processedMessages;

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

  const basePrompt = await buildSystemPrompt(session.user.sub, toneId);
  const systemPrompt = mode && MODE_PROMPTS[mode]
    ? MODE_PROMPTS[mode] + basePrompt
    : basePrompt;

  let mcpClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  let mcpTools: ToolSet = {};

  if (process.env.MCP_SERVER_URL) {
    try {
      const { token: accessToken } = await auth0.getAccessToken();
      mcpClient = await createMCPClient({
        transport: {
          type: "sse",
          url: process.env.MCP_SERVER_URL,
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        },
      });
      mcpTools = await mcpClient.tools();
    } catch (err) {
      console.warn("[chat] MCP unavailable, continuing without tools:", (err as Error).message);
      mcpClient = null;
      mcpTools = {};
    }
  }

  try {
    const result = streamText({
      model: getModel(modelId),
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(5),
      ...(Object.keys(mcpTools).length > 0 && { tools: mcpTools }),
      onFinish: async ({ text, totalUsage }) => {
        console.log("[chat] totalUsage:", JSON.stringify(totalUsage));
        await mcpClient?.close();

        // Memory update — only when there's actual text exchange
        if (text && lastUserText) {
          updateMemorySummary(session.user.sub, lastUserText, text).catch(console.error);
        }

        if (conversationId && text) {
          await connectDB();
          const isFirst = uiMessages.filter((m) => m.role === "user").length === 1;

          // totalUsage aggregates across all steps (tool call rounds).
          // For Anthropic: inputTokenDetails breaks down cache buckets for accurate pricing.
          // For OpenAI: no cache breakdown — use inputTokens directly at full price.
          const cacheReadTokens    = totalUsage.inputTokenDetails?.cacheReadTokens  ?? 0;
          const cacheWriteTokens   = totalUsage.inputTokenDetails?.cacheWriteTokens ?? 0;
          const noCacheInputTokens = isAnthropicModel
            ? (totalUsage.inputTokenDetails?.noCacheTokens ?? 0)
            : (totalUsage.inputTokens ?? 0);
          const outputTokens       = totalUsage.outputTokens ?? 0;

          console.log("[chat] tokens — noCache:", noCacheInputTokens, "cacheRead:", cacheReadTokens, "cacheWrite:", cacheWriteTokens, "output:", outputTokens);

          const reqCost = calculateRequestCost(modelId, noCacheInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

          // Conversation title: prefer user text, fall back to first attached filename
          const firstFileName = lastUserFiles[0]?.filename;
          const titleSource = lastUserText || (firstFileName ? `[File] ${firstFileName}` : "New Chat");

          await UserUsage.findOneAndUpdate(
            { userId: session.user.sub, modelId },
            { $inc: { totalCostUsd: reqCost, conversationCount: isFirst ? 1 : 0, inputTokens: noCacheInputTokens, outputTokens, cacheReadTokens, cacheCreationTokens: cacheWriteTokens } },
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
  } catch (err: any) {
    await mcpClient?.close();

    const lastErr = err?.lastError ?? err;
    const statusCode: number = lastErr?.statusCode ?? 500;
    const isRateLimit = statusCode === 429;
    const retryAfter: number | undefined = lastErr?.responseHeaders?.["retry-after"]
      ? parseInt(lastErr.responseHeaders["retry-after"], 10)
      : undefined;

    // Extract clean message from the API error body
    let message = lastErr?.message ?? err?.message ?? "An unexpected error occurred.";
    try {
      const body = JSON.parse(lastErr?.responseBody ?? "{}");
      if (body?.error?.message) message = body.error.message;
    } catch { /* ignore */ }

    console.error("[chat] error:", statusCode, message);

    return NextResponse.json(
      {
        error: isRateLimit ? "rate_limit" : "api_error",
        message,
        ...(retryAfter !== undefined && { retryAfter }),
      },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
