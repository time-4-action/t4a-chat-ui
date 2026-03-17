import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserGmail } from "@/models/user-gmail";
import { decrypt } from "@/lib/gmail-crypto";
import { NextResponse } from "next/server";

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function DELETE() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const record = await UserGmail.findOne({ userId: session.user.sub });
  if (!record) return NextResponse.json({ ok: true }); // already disconnected

  // Get a fresh access_token to revoke (revoke endpoint accepts either token type)
  let tokenToRevoke: string | null = null;
  try {
    const refreshToken = decrypt(record.encryptedRefreshToken, record.iv, record.authTag);

    // Exchange refresh_token for a fresh access_token to revoke
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (tokenRes.ok) {
      const data = await tokenRes.json();
      tokenToRevoke = data.access_token ?? null;
    }

    // Also revoke the refresh_token directly
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("[gmail/disconnect] token revocation error:", (err as Error).message);
    // Continue with DB deletion even if revocation fails
  }

  // Revoke access_token too if we got one
  if (tokenToRevoke) {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(tokenToRevoke)}`, {
      method: "POST",
    }).catch(() => {});
  }

  await UserGmail.deleteOne({ userId: session.user.sub });
  return NextResponse.json({ ok: true });
}
