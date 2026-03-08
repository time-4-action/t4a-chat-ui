import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserUsage } from "@/models/user-usage";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const rows = await UserUsage.find({ userId: session.user.sub }).lean();

  const totalCostUsd = rows.reduce((sum, r) => sum + (r.totalCostUsd ?? 0), 0);
  const conversationCount = rows.reduce((sum, r) => sum + (r.conversationCount ?? 0), 0);
  const byModel = rows.map((r) => ({
    modelId: r.modelId,
    conversationCount: r.conversationCount,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    cacheReadTokens: r.cacheReadTokens ?? 0,
    cacheCreationTokens: r.cacheCreationTokens ?? 0,
    totalCostUsd: r.totalCostUsd,
  }));

  return NextResponse.json({ totalCostUsd, conversationCount, byModel });
}
