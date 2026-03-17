import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { UserGmail } from "@/models/user-gmail";
import { encrypt } from "@/lib/gmail-crypto";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export async function GET(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.redirect(new URL("/auth/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle user-denied consent
  if (error) {
    return NextResponse.redirect(new URL("/settings?gmailError=access_denied", req.url));
  }

  // Verify state matches current user (CSRF protection)
  if (!code || state !== session.user.sub) {
    return NextResponse.redirect(new URL("/settings?gmailError=invalid_state", req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/settings?gmailError=not_configured", req.url));
  }

  const redirectUri = `${process.env.AUTH0_BASE_URL}/api/gmail/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[gmail/callback] token exchange failed:", await tokenRes.text());
    return NextResponse.redirect(new URL("/settings?gmailError=token_exchange_failed", req.url));
  }

  const tokenData = await tokenRes.json();
  const { refresh_token, access_token } = tokenData;

  if (!refresh_token) {
    // Google only returns refresh_token on first consent — user may need to revoke and reconnect
    return NextResponse.redirect(new URL("/settings?gmailError=no_refresh_token", req.url));
  }

  // Fetch Google account email (non-sensitive, stored plaintext)
  let googleEmail = "";
  try {
    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      googleEmail = info.email ?? "";
    }
  } catch { /* non-critical */ }

  // Encrypt refresh_token before storing
  const { ciphertext, iv, authTag } = encrypt(refresh_token);

  await connectDB();
  await UserGmail.findOneAndUpdate(
    { userId: session.user.sub },
    {
      $set: {
        encryptedRefreshToken: ciphertext,
        iv,
        authTag,
        googleEmail,
        connectedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return NextResponse.redirect(new URL("/settings?gmailConnected=true", req.url));
}
