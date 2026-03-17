/**
 * Retrieves a fresh Google access token for the given user.
 * Returns null if the user has not connected Gmail or if the exchange fails.
 * This is called in the chat route before creating the Gmail MCP client.
 */
import { connectDB } from "@/lib/mongodb";
import { UserGmail } from "@/models/user-gmail";
import { decrypt } from "@/lib/gmail-crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function getGmailAccessToken(userId: string): Promise<string | null> {
  await connectDB();
  const record = await UserGmail.findOne({ userId });
  if (!record) return null;

  try {
    const refreshToken = decrypt(record.encryptedRefreshToken, record.iv, record.authTag);

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      console.warn("[gmail-token] access token exchange failed:", res.status);
      return null;
    }

    const data = await res.json();
    return data.access_token ?? null;
  } catch (err) {
    console.warn("[gmail-token] error:", (err as Error).message);
    return null;
  }
}
