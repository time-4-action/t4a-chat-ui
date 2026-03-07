import { auth0 } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChatWindow from "@/components/chat-window";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Time 4 Action Chat - New Chat" };

export default async function NewChatPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login");

  return <ChatWindow conversationId="new" />;
}
