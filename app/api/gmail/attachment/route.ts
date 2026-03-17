import { auth0 } from "@/lib/auth";
import { getGmailAccessToken } from "@/lib/gmail-token";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const messageId = searchParams.get("messageId");
  const attachmentId = searchParams.get("attachmentId");
  const filename = searchParams.get("filename") ?? "attachment";
  const mimeType = searchParams.get("mimeType") ?? "application/octet-stream";

  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "Missing messageId or attachmentId" }, { status: 400 });
  }

  const accessToken = await getGmailAccessToken(session.user.sub);
  if (!accessToken) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 403 });
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  const raw = res.data.data ?? "";
  const bytes = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  const isInline = mimeType.startsWith("image/");
  const disposition = isInline
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`;

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": disposition,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}
