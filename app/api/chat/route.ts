import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { UserUsage } from "@/models/user-usage";
import { UserLimit } from "@/models/user-limit";
import { UserPreference } from "@/models/user-preference";
import { UserMemory } from "@/models/user-memory";
import { UserTone } from "@/models/user-tone";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createMCPClient } from "@ai-sdk/mcp";
import { streamText, generateText, stepCountIs, convertToModelMessages, UIMessage, ToolSet } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MODEL, ModelId, MODEL_CONFIGS, calculateRequestCost } from "@/lib/models";
import { getGmailAccessToken } from "@/lib/gmail-token";
import { buildGmailTools } from "@/lib/gmail-tools";

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

// ─── Cost-limit helpers ────────────────────────────────────────────────────

function getPeriodStart(period: string, now: Date): Date {
  const d = new Date(now);
  if (period === "daily") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "weekly") {
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "monthly") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // total — period never resets; use epoch as fixed start
  return new Date(0);
}

function getNextReset(period: string, periodStart: Date): Date | null {
  if (period === "total") return null;
  const d = new Date(periodStart);
  if (period === "daily")   { d.setDate(d.getDate() + 1); return d; }
  if (period === "weekly")  { d.setDate(d.getDate() + 7); return d; }
  if (period === "monthly") { d.setMonth(d.getMonth() + 1); return d; }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

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
- If asked to remember something, confirm briefly ("Got it.") and continue

## Document generation

When the user asks to write, create, draft, or generate a document, report, brief, proposal, memo, or any long-form written content, output ONLY a fenced JSON block:

\`\`\`json
{ "type": "document", "title": "...", "sections": [{ "heading": "...", "level": 1, "content": [{ "type": "paragraph", "text": "..." }] }] }
\`\`\`

When the user asks to create a presentation, pitch deck, or slideshow, output ONLY a fenced JSON block:

\`\`\`json
{ "type": "presentation", "title": "...", "slides": [{ "title": "...", "layout": "title-content", "content": [{ "type": "bullet_list", "items": ["..."] }] }] }
\`\`\`

Rules:
- Output only the JSON block — no surrounding prose, no explanation before or after
- Supported content block types: paragraph, bullet_list, numbered_list, table, code
- For table blocks use: { "type": "table", "headers": [...], "rows": [[...], ...] }
- Heading level must be 1, 2, or 3
- Keep slides focused: max 5-6 bullets per slide
- Slide layout options: "title-content", "title-only", "blank"`;

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

const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "api_error", message: "Your message is too large (over 20 MB). Please remove some attachments and try again." },
      { status: 413 }
    );
  }

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

  // ── Cost limit check ─────────────────────────────────────────────────────
  const userLimit = await UserLimit.findOne({ userId: session.user.sub });
  if (userLimit) {
    const now = new Date();
    const expectedStart = getPeriodStart(userLimit.period, now);
    if (userLimit.periodStart < expectedStart) {
      await UserLimit.updateOne(
        { userId: session.user.sub },
        { $set: { currentSpendUsd: 0, periodStart: expectedStart, updatedAt: now } }
      );
      userLimit.currentSpendUsd = 0;
    }
    if (userLimit.currentSpendUsd >= userLimit.limitUsd) {
      const nextReset = getNextReset(userLimit.period, userLimit.periodStart);
      return NextResponse.json(
        {
          error: "limit_exceeded",
          limitUsd: userLimit.limitUsd,
          currentSpendUsd: userLimit.currentSpendUsd,
          period: userLimit.period,
          resetAt: nextReset ?? null,
        },
        { status: 429 }
      );
    }
  }
  // ────────────────────────────────────────────────────────────────────────

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
  const systemPromptBase = mode && MODE_PROMPTS[mode]
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

  // Gmail tools — injected directly when the user has Gmail connected
  let gmailEnabled = false;
  let gmailSenderIdentity = "";
  try {
    const gmailAccessToken = await getGmailAccessToken(session.user.sub);
    if (gmailAccessToken) {
      const gmailPrefs = {
        senderName: userPrefs?.personalInfo?.name || undefined,
        senderEmail: undefined as string | undefined, // resolved below via get_profile if needed
        signatureHtml: userPrefs?.communicationStyle?.signatureStyle || undefined,
      };
      const gmailTools = buildGmailTools(gmailAccessToken, gmailPrefs);
      mcpTools = { ...mcpTools, ...gmailTools };
      gmailEnabled = true;

      if (gmailPrefs.senderName) {
        gmailSenderIdentity = `\nYour sender identity: **${gmailPrefs.senderName}**${userPrefs?.personalInfo?.jobTitle ? `, ${userPrefs.personalInfo.jobTitle}` : ""}${userPrefs?.personalInfo?.company ? ` at ${userPrefs.personalInfo.company}` : ""}.`;
      }
    }
  } catch (err) {
    console.warn("[chat] Gmail tools unavailable:", (err as Error).message);
  }

  const signatureNote = userPrefs?.communicationStyle?.signatureStyle
    ? "\nThe user's email signature is automatically appended to every draft — do NOT write a closing, sign-off, or signature in the email body. End the body after the last content paragraph."
    : "";

  const gmailPromptSection = gmailEnabled
    ? `\n\n## Gmail

You have access to the user's Gmail via: gmail_search_messages, gmail_read_message, gmail_read_thread, gmail_list_labels, gmail_create_draft, gmail_get_profile.
Always use these tools when the user asks about email, inbox, messages, or wants to draft/send.
Never say you lack email access.
${gmailSenderIdentity}${signatureNote}

### MANDATORY workflow — you MUST follow this exact sequence for every email query:

**Step 1 — Search:** Call gmail_search_messages to find relevant message IDs.
**Step 2 — Read (REQUIRED, NO EXCEPTIONS):** For EVERY message from step 1, call gmail_read_message immediately. You MUST call this tool — never skip it, never summarize from search metadata alone, never answer before calling gmail_read_message. The search result has NO body content.
**Step 3 — Thread (optional):** Call gmail_read_thread if the user asks about the full conversation.
**Step 4 — Respond:** Only after completing all tool calls above, write your final response. Attachments from gmail_read_message are already resolved — present them directly without calling any download tool.

CRITICAL: Never respond with email content without first calling gmail_read_message. The search tool returns NO body/content. If you skip gmail_read_message you are fabricating content.`
    : "";

  const systemPrompt = systemPromptBase + gmailPromptSection;

  try {
    const result = streamText({
      model: getModel(modelId),
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(10),
      ...(Object.keys(mcpTools).length > 0 && { tools: mcpTools }),
      onFinish: async ({ text, totalUsage, steps }) => {
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
          if (reqCost > 0) {
            await UserLimit.updateOne(
              { userId: session.user.sub },
              { $inc: { currentSpendUsd: reqCost }, $set: { updatedAt: new Date() } }
            );
          }
          // Reconstruct full UIMessage parts from steps for proper history rendering
          const assistantParts: any[] = [];
          for (const step of steps) {
            assistantParts.push({ type: "step-start" });
            for (const call of (step as any).toolCalls ?? []) {
              const result = ((step as any).toolResults ?? []).find((r: any) => r.toolCallId === call.toolCallId);
              assistantParts.push({
                type: `tool-${call.toolName}`,
                toolCallId: call.toolCallId,
                state: result ? "output-available" : "input-available",
                input: call.input,
                ...(result ? { output: result.output } : {}),
              });
            }
            if ((step as any).text) {
              assistantParts.push({ type: "text", text: (step as any).text, state: "done" });
            }
          }

          const userParts: any[] = [
            ...lastUserFiles.map((f) => ({ type: "file", mediaType: f.mediaType, filename: f.filename, url: f.url })),
            { type: "text", text: lastUserText, state: "done" },
          ];

          await Conversation.findByIdAndUpdate(conversationId, {
            $push: {
              messages: {
                $each: [
                  { role: "user", content: lastUserText, files: lastUserFiles, parts: userParts },
                  { role: "assistant", content: text, parts: assistantParts },
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
