import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";
import { streamText, stepCountIs, convertToModelMessages, UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the time-4-action AI assistant. You help the team with product information, orders, and internal tasks. You have access to company tools — always use them when asked about products, orders, or customer data.

Formatting rules:
- Use **bold** for key terms, names, values, and important info
- Use bullet lists or numbered lists for multiple items — never run them together in a sentence
- Use headings (##) when the response has multiple distinct sections
- Use tables for structured data like product specs, order details, or comparisons
- Keep paragraphs short — one idea per paragraph
- Never dump a wall of text — break everything up visually
- Be direct and concise — lead with the answer, then add detail below`;

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages: uiMessages, conversationId } = await req.json() as {
    messages: UIMessage[];
    conversationId?: string;
  };

  const messages = await convertToModelMessages(uiMessages);

  // Extract last user message text for MongoDB save
  const lastUserMsg = [...uiMessages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMsg?.parts
    ?.filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("") ?? "";

  const mcpClient = await createMCPClient({
    transport: {
      type: "sse",
      url: process.env.MCP_SERVER_URL!,
    },
  });

  const mcpTools = await mcpClient.tools();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SYSTEM_PROMPT,
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
