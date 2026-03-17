/**
 * Gmail tools implemented directly via googleapis.
 * These are injected into streamText when the user has Gmail connected.
 *
 * IMPORTANT: Use `inputSchema` (not `parameters`) so the AI SDK's
 * prepareToolsAndToolChoice reads it correctly. `parameters` is left
 * undefined → asSchema(undefined) → missing `type` field → Anthropic 400.
 */
import { tool, jsonSchema } from "ai";
import { google } from "googleapis";

function getGmail(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBody(payload: any): { text: string; isHtml: boolean } {
  if (!payload) return { text: "", isHtml: false };
  if (payload.body?.data) {
    const raw = decodeBase64(payload.body.data);
    const isHtml = raw.trimStart().startsWith("<");
    return { text: isHtml ? raw : raw, isHtml };
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data)
        return { text: decodeBase64(part.body.data), isHtml: false };
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data)
        return { text: decodeBase64(part.body.data), isHtml: true };
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested.text) return nested;
    }
  }
  return { text: "", isHtml: false };
}

function headerValue(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractAttachments(payload: any): Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> {
  const attachments: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }> = [];
  function walk(part: any) {
    if (part?.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part?.parts) part.parts.forEach(walk);
  }
  if (payload) walk(payload);
  return attachments;
}

export interface GmailUserPrefs {
  senderName?: string;     // e.g. "John Smith"
  senderEmail?: string;    // e.g. "john@company.com"
  signatureHtml?: string;  // raw HTML from profile editor
}

export function buildGmailTools(accessToken: string, userPrefs: GmailUserPrefs = {}) {
  const gmail = getGmail(accessToken);
  const signaturePlain = userPrefs.signatureHtml ? htmlToText(userPrefs.signatureHtml) : "";

  return {
    gmail_search_messages: tool({
      description: "Search Gmail messages using Gmail search syntax. Returns message IDs with basic metadata (id, subject, from, date, threadId). IMPORTANT: This tool returns NO email body or content — you MUST call gmail_read_message for every result to get the actual content before responding to the user.",
      inputSchema: jsonSchema<{ query: string; maxResults?: number }>({
        type: "object",
        properties: {
          query: { type: "string", description: 'Gmail search query, e.g. "from:boss@company.com" or "is:unread"' },
          maxResults: { type: "number", description: "Maximum results (default 10, max 20)" },
        },
        required: ["query"],
      }),
      execute: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
        const res = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: Math.min(maxResults ?? 10, 20),
        });
        const messages = res.data.messages ?? [];
        if (!messages.length) return { results: [] };

        const summaries = await Promise.all(
          messages.slice(0, 10).map(async (m) => {
            const msg = await gmail.users.messages.get({
              userId: "me",
              id: m.id!,
              format: "metadata",
              metadataHeaders: ["Subject", "From", "Date"],
            });
            const h = msg.data.payload?.headers ?? [];
            return {
              id: m.id,
              subject: headerValue(h, "Subject"),
              from: headerValue(h, "From"),
              date: headerValue(h, "Date"),
              threadId: msg.data.threadId,
              // No snippet — forces gmail_read_message for full content
            };
          })
        );
        return { results: summaries };
      },
    }),

    gmail_read_message: tool({
      description: "Read the full content of a single Gmail message by its ID. Attachments are automatically resolved — each attachment in the result already includes a downloadUrl ready for display. Do NOT call gmail_download_attachment separately; just present the attachments from this result directly.",
      inputSchema: jsonSchema<{ messageId: string }>({
        type: "object",
        properties: {
          messageId: { type: "string", description: "The Gmail message ID" },
        },
        required: ["messageId"],
      }),
      execute: async ({ messageId }: { messageId: string }) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });
        const h = msg.data.payload?.headers ?? [];
        const { text: bodyText, isHtml } = extractBody(msg.data.payload);
        const rawAttachments = extractAttachments(msg.data.payload);
        const plainBody = isHtml ? htmlToText(bodyText) : bodyText;
        const attachments = rawAttachments.map((a) => {
          const params = new URLSearchParams({
            messageId: msg.data.id!,
            attachmentId: a.attachmentId,
            filename: a.filename,
            mimeType: a.mimeType,
          });
          return { ...a, downloadUrl: `/api/gmail/attachment?${params.toString()}` };
        });
        return {
          id: msg.data.id,
          threadId: msg.data.threadId,
          subject: headerValue(h, "Subject"),
          from: headerValue(h, "From"),
          to: headerValue(h, "To"),
          date: headerValue(h, "Date"),
          snippet: msg.data.snippet ?? "",
          body: plainBody.slice(0, 30000),
          labels: msg.data.labelIds ?? [],
          attachments,
        };
      },
    }),

    gmail_read_thread: tool({
      description: "Read all messages in a Gmail thread (conversation) by thread ID.",
      inputSchema: jsonSchema<{ threadId: string }>({
        type: "object",
        properties: {
          threadId: { type: "string", description: "The Gmail thread ID" },
        },
        required: ["threadId"],
      }),
      execute: async ({ threadId }: { threadId: string }) => {
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: threadId,
          format: "full",
        });
        const messages = (thread.data.messages ?? []).map((msg) => {
          const h = msg.payload?.headers ?? [];
          return {
            id: msg.id,
            from: headerValue(h, "From"),
            to: headerValue(h, "To"),
            date: headerValue(h, "Date"),
            body: extractBody(msg.payload).text.slice(0, 4000),
          };
        });
        return {
          threadId,
          subject: headerValue(thread.data.messages?.[0]?.payload?.headers ?? [], "Subject"),
          messageCount: messages.length,
          messages,
        };
      },
    }),

    gmail_list_labels: tool({
      description: "List all Gmail labels for the user (inbox, sent, custom labels, etc.).",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const res = await gmail.users.labels.list({ userId: "me" });
        return {
          labels: (res.data.labels ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type })),
        };
      },
    }),

    gmail_create_draft: tool({
      description: "Create a Gmail draft. Does NOT send — only saves to Drafts folder.",
      inputSchema: jsonSchema<{ to: string; subject: string; body: string; cc?: string }>({
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Plain text email body" },
          cc: { type: "string", description: "CC email addresses (comma-separated)" },
        },
        required: ["to", "subject", "body"],
      }),
      execute: async ({ to, subject, body, cc }: { to: string; subject: string; body: string; cc?: string }) => {
        const fromHeader = userPrefs.senderName && userPrefs.senderEmail
          ? `From: ${userPrefs.senderName} <${userPrefs.senderEmail}>`
          : userPrefs.senderEmail
          ? `From: ${userPrefs.senderEmail}`
          : null;

        const fullBody = signaturePlain
          ? `${body}\n\n--\n${signaturePlain}`
          : body;

        const lines = [
          fromHeader,
          `To: ${to}`,
          cc ? `Cc: ${cc}` : null,
          `Subject: ${subject}`,
          "Content-Type: text/plain; charset=utf-8",
          "",
          fullBody,
        ].filter(Boolean);

        const raw = Buffer.from(lines.join("\r\n"))
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const draft = await gmail.users.drafts.create({
          userId: "me",
          requestBody: { message: { raw } },
        });
        return {
          draftId: draft.data.id,
          messageId: draft.data.message?.id,
          status: "Draft saved successfully.",
        };
      },
    }),

    gmail_get_profile: tool({
      description: "Get the user's Gmail profile (email address, message count, thread count).",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const profile = await gmail.users.getProfile({ userId: "me" });
        return {
          email: profile.data.emailAddress,
          messagesTotal: profile.data.messagesTotal,
          threadsTotal: profile.data.threadsTotal,
        };
      },
    }),

    gmail_download_attachment: tool({
      description: "Prepare an email attachment for display/download in the chat. NOTE: gmail_read_message already includes downloadUrl on each attachment automatically — only call this tool if you have an attachmentId but no downloadUrl (e.g. from an older search result).",
      inputSchema: jsonSchema<{ messageId: string; attachmentId: string; filename: string; mimeType: string; size: number }>({
        type: "object",
        properties: {
          messageId: { type: "string", description: "The Gmail message ID containing the attachment" },
          attachmentId: { type: "string", description: "The attachment ID (from gmail_read_message attachments list)" },
          filename: { type: "string", description: "Original filename of the attachment" },
          mimeType: { type: "string", description: "MIME type of the attachment (e.g. 'image/jpeg', 'application/pdf')" },
          size: { type: "number", description: "File size in bytes (from gmail_read_message attachments list)" },
        },
        required: ["messageId", "attachmentId", "filename", "mimeType", "size"],
      }),
      execute: async ({ messageId, attachmentId, filename, mimeType, size }: { messageId: string; attachmentId: string; filename: string; mimeType: string; size: number }) => {
        const params = new URLSearchParams({ messageId, attachmentId, filename, mimeType });
        const downloadUrl = `/api/gmail/attachment?${params.toString()}`;
        return { filename, mimeType, size, downloadUrl };
      },
    }),
  };
}
