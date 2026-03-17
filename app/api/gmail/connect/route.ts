import { auth0 } from "@/lib/auth";
import { NextResponse } from "next/server";

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Scopes: readonly + compose (for drafts)
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "email",
].join(" ");

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });

  const redirectUri = `${process.env.AUTH0_BASE_URL}/api/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",          // force consent screen to always get refresh_token
    state: session.user.sub,    // pass userId as state for verification in callback
  });

  return NextResponse.redirect(`${GOOGLE_OAUTH_URL}?${params.toString()}`);
}
