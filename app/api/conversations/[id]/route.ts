import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await connectDB();
  const conversation = await Conversation.findOne({
    _id: id,
    userId: session.user.sub,
  });

  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(conversation);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title } = await req.json();

  await connectDB();
  const conversation = await Conversation.findOneAndUpdate(
    { _id: id, userId: session.user.sub },
    { title, updatedAt: new Date() },
    { new: true }
  );

  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(conversation);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await connectDB();
  await Conversation.findOneAndDelete({ _id: id, userId: session.user.sub });
  return NextResponse.json({ success: true });
}
