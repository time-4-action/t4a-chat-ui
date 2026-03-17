import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { redirect, notFound } from "next/navigation";
import ChatWindow from "@/components/chat-window";
import { UIMessage } from "ai";
import { DEFAULT_MODEL, ModelId } from "@/lib/models";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await connectDB();
  const conversation = await Conversation.findById(id).select("title").lean();
  const title = (conversation as any)?.title ?? "New Chat";
  return { title: `Time 4 Action Chat - ${title}` };
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login");

  await connectDB();
  const conversation = await Conversation.findOne({
    _id: id,
    userId: session.user.sub,
  });

  if (!conversation) notFound();

  // Use .toObject() to get a plain JS object — `conversation.model` conflicts
  // with Mongoose's internal Model reference and can't be serialized to client.
  const conv = conversation.toObject();

  const initialMessages: UIMessage[] = conv.messages.map((m: any) => ({
    id: m._id.toString(),
    role: m.role as "user" | "assistant",
    // Use stored parts (full tool results) when available; fall back to text-only for old messages
    parts: m.parts ?? [
      ...(m.files ?? []).map((f: any) => ({
        type: "file" as const,
        mediaType: f.mediaType,
        filename: f.filename,
        url: f.url,
      })),
      { type: "text" as const, text: m.content },
    ],
  }));

  return (
    <ChatWindow
      conversationId={id}
      initialMessages={initialMessages}
      initialModel={(conv.model as ModelId) ?? DEFAULT_MODEL}
      initialCost={conv.totalCostUsd ?? 0}
    />
  );
}
