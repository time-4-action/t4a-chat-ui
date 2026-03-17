import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserGmail } from "@/models/user-gmail";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const record = await UserGmail.findOne(
    { userId: session.user.sub },
    { googleEmail: 1, connectedAt: 1 }   // never expose encrypted fields
  );

  if (!record) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    email: record.googleEmail,
    connectedAt: record.connectedAt,
  });
}
