import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { redirect } from "next/navigation";

export default async function NewChatPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login");

  await connectDB();
  const conversation = await Conversation.create({ userId: session.user.sub });
  redirect(`/chat/${conversation._id}`);
}
