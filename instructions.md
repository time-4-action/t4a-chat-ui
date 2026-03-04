# time-4-action AI — Vibe Coding Guide

A practical implementation reference for building the internal AI chat UI.
Stack: **Next.js 14 (App Router) + Vercel AI SDK + Anthropic + shadcn/ui + Auth0 + MongoDB**

---

## Architecture Overview

```
Browser (Next.js frontend)
  └── /chat page
        └── useChat() hook (Vercel AI SDK)
              └── POST /api/chat
                    ├── Anthropic API  (claude-sonnet-4-6)
                    │     └── mcp_servers: [mcp.time-4-action.com]
                    └── MongoDB  (save/load conversation history)

Auth0 middleware protects all /chat and /api/chat routes
```

---

## 1. Project Structure

```
/app
  layout.tsx                  # fonts, global providers
  page.tsx                    # redirect to /chat
  /chat
    page.tsx                  # main chat UI
    /[id]
      page.tsx                # load specific conversation
  /api
    /chat
      route.ts                # streaming API — Anthropic + MCP
    /conversations
      route.ts                # GET list, POST new
    /conversations/[id]
      route.ts                # GET messages, DELETE

/components
  chat-window.tsx             # useChat wrapper, message list
  message-bubble.tsx          # renders user / assistant messages
  tool-call-indicator.tsx     # "Fetching data..." spinner
  conversation-sidebar.tsx    # list of past chats
  new-chat-button.tsx

/lib
  anthropic.ts                # Anthropic client singleton
  mongodb.ts                  # MongoDB client singleton
  auth.ts                     # Auth0 helpers

/models
  conversation.ts             # Mongoose schema

/middleware.ts                # Auth0 route protection

.env.local                    # all secrets (see below)
```

---

## 2. Environment Variables

```bash
# .env.local

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# MCP Server
MCP_SERVER_URL=https://mcp.time-4-action.com/sse

# Auth0
AUTH0_SECRET=<random 32 char string>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-tenant>.eu.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...

# MongoDB
MONGODB_URI=mongodb+srv://...

# App
NEXT_PUBLIC_APP_NAME=time-4-action AI
NEXT_PUBLIC_COMPANY_COLOR=#0f172a   # your brand primary color
```

---

## 3. Auth0 Setup

### Install
```bash
npm install @auth0/nextjs-auth0
```

### `/lib/auth.ts`
```ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client();
```

### `/app/api/auth/[auth0]/route.ts`
```ts
import { auth0 } from "@/lib/auth";
export const GET = auth0.handleAuth();
```

### `/middleware.ts`
```ts
import { auth0 } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: ["/chat/:path*", "/api/chat/:path*", "/api/conversations/:path*"],
};
```

### Getting the user in server components / API routes
```ts
import { auth0 } from "@/lib/auth";

const session = await auth0.getSession();
if (!session) redirect("/api/auth/login");
const userId = session.user.sub; // use as MongoDB owner key
```

> Auth0 tenant should be configured at auth0.com — add callback URL
> `http://localhost:3000/api/auth/callback` for dev and your production URL for prod.

---

## 4. MongoDB — Conversation History

### Install
```bash
npm install mongoose
```

### `/lib/mongodb.ts`
```ts
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;
let cached = (global as any).mongoose || { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(MONGODB_URI);
  cached.conn = await cached.promise;
  return cached.conn;
}
```

### `/models/conversation.ts`
```ts
import mongoose, { Schema } from "mongoose";

const MessageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ConversationSchema = new Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, default: "New Chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", ConversationSchema);
```

### `/app/api/conversations/route.ts`
```ts
import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const conversations = await Conversation
    .find({ userId: session.user.sub })
    .select("title createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .limit(50);

  return NextResponse.json(conversations);
}

export async function POST() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const conversation = await Conversation.create({ userId: session.user.sub });
  return NextResponse.json(conversation);
}
```

---

## 5. API Route — Anthropic + MCP + Streaming

### Install
```bash
npm install ai @ai-sdk/anthropic
```

### `/app/api/chat/route.ts`
```ts
import { auth0 } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Conversation } from "@/models/conversation";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the time-4-action AI assistant. You help the team with
product information, orders, and internal tasks. You have access to company tools —
always use them when asked about products, orders, or customer data.
Be concise, professional, and helpful.`;

export async function POST(req: NextRequest) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, conversationId } = await req.json();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 5, // allows multi-step MCP tool chaining
    // @ts-ignore — MCP supported, types may lag behind
    mcp: {
      servers: {
        "time4action": {
          type: "sse",
          url: process.env.MCP_SERVER_URL!,
        },
      },
    },
    onFinish: async ({ text }) => {
      // Save to MongoDB only after full response
      if (conversationId) {
        await connectDB();
        const lastUserMsg = messages[messages.length - 1];
        await Conversation.findByIdAndUpdate(conversationId, {
          $push: {
            messages: {
              $each: [
                { role: "user", content: lastUserMsg.content },
                { role: "assistant", content: text },
              ],
            },
          },
          $set: {
            updatedAt: new Date(),
            // Auto-title from first user message
            ...(messages.length === 1 && {
              title: lastUserMsg.content.slice(0, 60),
            }),
          },
        });
      }
    },
  });

  return result.toDataStreamResponse();
}
```

> **MCP note:** All tools exposed by `mcp.time-4-action.com` are available to Claude
> automatically — no manual tool definitions needed. Claude decides when to call them.

---

## 6. Vercel AI SDK — Frontend

### `/components/chat-window.tsx`
```tsx
"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import MessageBubble from "./message-bubble";
import ToolCallIndicator from "./tool-call-indicator";

interface Props {
  conversationId: string;
  initialMessages?: any[];
}

export default function ChatWindow({ conversationId, initialMessages = [] }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    initialMessages,
    body: { conversationId }, // sent with every request
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {isLoading && <ToolCallIndicator />}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask anything..."
          className="flex-1 rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

### `/components/message-bubble.tsx`
```tsx
import { Message } from "ai";
import { cn } from "@/lib/utils";

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap",
        isUser
          ? "bg-primary text-primary-foreground rounded-br-sm"
          : "bg-muted text-foreground rounded-bl-sm"
      )}>
        {message.content}
      </div>
    </div>
  );
}
```

### `/components/tool-call-indicator.tsx`
```tsx
export default function ToolCallIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-muted text-muted-foreground text-xs px-4 py-2 rounded-2xl rounded-bl-sm flex items-center gap-2">
        <span className="animate-pulse">⚙</span>
        Accessing company data...
      </div>
    </div>
  );
}
```

---

## 7. Branding with shadcn/ui

### Install
```bash
npx shadcn@latest init
# Choose: New York style, CSS variables for colors
npx shadcn@latest add button input scroll-area separator
```

### Set brand colors in `/app/globals.css`
```css
:root {
  --primary: 222 47% 11%;           /* dark navy — swap to your brand HSL */
  --primary-foreground: 210 40% 98%;
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --radius: 0.75rem;
}

.dark {
  --primary: 210 40% 98%;
  --primary-foreground: 222 47% 11%;
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;
}
```

> All shadcn components and your Tailwind classes (`bg-primary`, `text-muted`, etc.)
> update automatically when you change these variables.

### Logo in sidebar
```tsx
import Image from "next/image";
// place logo.svg in /public
<Image src="/logo.svg" alt="time-4-action" width={140} height={32} />
```

---

## 8. All Dependencies

```bash
npm install \
  @auth0/nextjs-auth0 \
  ai \
  @ai-sdk/anthropic \
  mongoose \
  class-variance-authority \
  clsx \
  tailwind-merge \
  lucide-react

npx shadcn@latest init
npx shadcn@latest add button input scroll-area separator
```

---

## 9. Dev Checklist

- [ ] Auth0 tenant created, callback URLs set (`/api/auth/callback`)
- [ ] `.env.local` filled with all secrets
- [ ] MongoDB cluster running, IP whitelist includes dev machine
- [ ] MCP server at `mcp.time-4-action.com` reachable (SSE endpoint live)
- [ ] `npm run dev` — Auth0 login flow works end to end
- [ ] Send a test message — streaming text appears in real time
- [ ] Send a product/order query — MCP tool fires, indicator shows
- [ ] Full conversation saves to MongoDB after response completes
- [ ] Sidebar loads past conversations on page refresh
- [ ] Brand colors applied, logo visible in sidebar

---

## 10. Gotchas

**MCP server requires auth token**
```ts
mcp: {
  servers: {
    "time4action": {
      type: "sse",
      url: process.env.MCP_SERVER_URL!,
      headers: { Authorization: `Bearer ${process.env.MCP_SECRET}` },
    },
  },
},
```

**Never save to MongoDB during streaming** — only in `onFinish`. Chunks are partial.

**Always use `session.user.sub` as `userId`** — never trust a userId sent from the client.

**`maxSteps: 5`** — lets Claude chain multiple MCP tool calls in one response (e.g. fetch product → check stock → format answer). Increase if workflows need more steps.

**Conversation title** — auto-set from first user message (first 60 chars). Good enough for MVP; improve later with a dedicated summarisation call if needed.

---

*Stack: Next.js 14 · Vercel AI SDK 4.x · @auth0/nextjs-auth0 4.x · Mongoose 8.x · claude-sonnet-4-6*