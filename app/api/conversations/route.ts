import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const conversations = await Conversation
    .find({ userId: session.user.sub })
    .select("title createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .limit(50);

  return NextResponse.json(conversations);
}

export async function POST() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const conversation = await Conversation.create({ userId: session.user.sub });
  return NextResponse.json(conversation);
}
