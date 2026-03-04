import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserPreference } from "@/models/user-preference";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const prefs = await UserPreference.findOne({ userId: session.user.sub });
  return NextResponse.json(prefs ?? {});
}

export async function PUT(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  await connectDB();

  const prefs = await UserPreference.findOneAndUpdate(
    { userId: session.user.sub },
    { ...body, userId: session.user.sub, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  return NextResponse.json(prefs);
}
