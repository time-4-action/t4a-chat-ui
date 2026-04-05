import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { NextRequest, NextResponse } from "next/server";
import { generateDocxFromDocument, generateDocxFromMarkdown } from "@/lib/export/docx-generator";
import { generatePptx } from "@/lib/export/pptx-generator";
import { generatePdfFromDocument, generatePdfFromMarkdown } from "@/lib/export/pdf-generator";
import { conversationToMarkdown, documentToMarkdown } from "@/lib/export/markdown-utils";
import type { DocumentData, PresentationData } from "@/lib/export/types";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  markdown: "text/markdown; charset=utf-8",
  md: "text/markdown; charset=utf-8",
};

const EXT: Record<string, string> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  markdown: "md",
  md: "md",
};

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.sub as string;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { source, format } = body;
  if (!source || !format) {
    return NextResponse.json({ error: "Missing source or format" }, { status: 400 });
  }

  const safeFormat = String(format).toLowerCase();
  const mimeType = MIME[safeFormat];
  const ext = EXT[safeFormat];
  if (!mimeType) {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  try {
    let buffer: Buffer | string;
    let filename = `export.${ext}`;

    if (source === "document") {
      const docJson: DocumentData | PresentationData = body.documentJson;
      if (!docJson) return NextResponse.json({ error: "Missing documentJson" }, { status: 400 });

      const safeTitle = (docJson.title ?? "document").replace(/[^a-z0-9_\- ]/gi, "_").slice(0, 50);
      filename = `${safeTitle}.${ext}`;

      if (safeFormat === "markdown") {
        buffer = documentToMarkdown(docJson);
      } else if (safeFormat === "pdf") {
        buffer = docJson.type === "document"
          ? await generatePdfFromDocument(docJson as DocumentData)
          : await generatePdfFromMarkdown(documentToMarkdown(docJson), docJson.title);
      } else if (safeFormat === "docx") {
        buffer = docJson.type === "document"
          ? await generateDocxFromDocument(docJson as DocumentData)
          : await generateDocxFromMarkdown(documentToMarkdown(docJson), docJson.title);
      } else if (safeFormat === "pptx") {
        if (docJson.type !== "presentation") {
          return NextResponse.json({ error: "PPTX only supports presentation type" }, { status: 400 });
        }
        buffer = await generatePptx(docJson as PresentationData);
      } else {
        return NextResponse.json({ error: "Unsupported format for document" }, { status: 400 });
      }

    } else if (source === "message") {
      const content: string = body.content ?? "";
      const title: string = body.title ?? "Message";
      filename = `message.${ext}`;

      if (safeFormat === "markdown") {
        buffer = content;
      } else if (safeFormat === "pdf") {
        buffer = await generatePdfFromMarkdown(content, title);
      } else if (safeFormat === "docx") {
        buffer = await generateDocxFromMarkdown(content, title);
      } else {
        return NextResponse.json({ error: "Unsupported format for message" }, { status: 400 });
      }

    } else if (source === "conversation") {
      const convId: string = body.conversationId;
      if (!convId) return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });

      await connectDB();
      const conv = await Conversation.findOne({ _id: convId, userId }).lean() as any;
      if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

      const markdown = conversationToMarkdown(conv.messages ?? []);
      const safeTitle = (conv.title ?? "conversation").replace(/[^a-z0-9_\- ]/gi, "_").slice(0, 50);
      filename = `${safeTitle}.${ext}`;

      if (safeFormat === "markdown") {
        buffer = markdown;
      } else if (safeFormat === "pdf") {
        buffer = await generatePdfFromMarkdown(markdown, conv.title ?? "Conversation");
      } else if (safeFormat === "docx") {
        buffer = await generateDocxFromMarkdown(markdown, conv.title ?? "Conversation");
      } else {
        return NextResponse.json({ error: "Unsupported format for conversation" }, { status: 400 });
      }

    } else {
      return NextResponse.json({ error: "Unknown source" }, { status: 400 });
    }

    const responseBuffer = typeof buffer === "string" ? Buffer.from(buffer, "utf-8") : buffer;

    return new NextResponse(new Uint8Array(responseBuffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(responseBuffer.length),
      },
    });
  } catch (err) {
    console.error("[export] error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
