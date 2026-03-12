# time-4-action AI — Developer Docs

Internal AI chat app built with Next.js + Vercel AI SDK + Anthropic + shadcn/ui + Auth0 + MongoDB.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| AI SDK | `ai@6`, `@ai-sdk/anthropic@3`, `@ai-sdk/react@3`, `@ai-sdk/mcp@1` |
| LLM | Claude (claude-sonnet-4-6) via Anthropic API |
| Auth | `@auth0/nextjs-auth0@4` |
| DB | MongoDB via Mongoose |
| UI | shadcn/ui (New York style) + Tailwind v4 |

---

## Architecture

```
Browser (Next.js frontend)
  └── /chat/[id] page
        └── useChat() hook (@ai-sdk/react) via DefaultChatTransport
              └── POST /api/chat
                    ├── Anthropic API (claude-sonnet-4-6)
                    │     └── MCP tools (via @ai-sdk/mcp SSE client)
                    └── MongoDB (save conversation history in onFinish)

Auth0 proxy (proxy.ts) protects all /chat and /api/* routes
```

---

## Project Structure

```
app/
  layout.tsx                     # Auth0Provider wrapper
  page.tsx                       # redirect to /chat
  chat/
    layout.tsx                   # sidebar layout
    page.tsx                     # POST /api/conversations → redirect to /chat/[id]
    [id]/
      page.tsx                   # load conversation, render ChatWindow
  api/
    chat/
      route.ts                   # streamText + MCP + save to MongoDB
    conversations/
      route.ts                   # GET list, POST new
    conversations/[id]/
      route.ts                   # GET messages, DELETE

components/
  chat-window.tsx                # useChat + DefaultChatTransport
  message-bubble.tsx             # renders UIMessage parts
  tool-call-indicator.tsx        # "Accessing company data..." spinner
  conversation-sidebar.tsx       # list of past conversations
  new-chat-button.tsx            # POST /api/conversations → navigate

lib/
  auth.ts                        # Auth0Client singleton
  mongodb.ts                     # Mongoose connection cache
  utils.ts                       # cn() utility (shadcn)

models/
  conversation.ts                # Conversation + Message mongoose schemas
  user-memory.ts                 # per-user AI memory
  user-preference.ts             # per-user preferences
  user-tone.ts                   # per-user tone settings
  user-usage.ts                  # per-user usage tracking

proxy.ts                         # Auth0 middleware (Next.js 16: proxy.ts, not middleware.ts)
.env.local                       # all secrets (see below)
```

---

## Environment Variables

```bash
# .env.local

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# MCP Server
MCP_SERVER_URL=https://mcp.time-4-action.com/sse
MCP_SECRET=<mcp bearer token>

# Auth0
AUTH0_SECRET=<random 32+ char string>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://<your-tenant>.eu.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...

# MongoDB
MONGODB_URI=mongodb+srv://...

# App
NEXT_PUBLIC_APP_NAME=time-4-action AI
NEXT_PUBLIC_COMPANY_COLOR=#0f172a
```

---

## Auth0 Setup (v4)

Auth0 v4 has **no `handleAuth()` route** — auth is handled automatically via the proxy.

### `/lib/auth.ts`
```ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";
export const auth0 = new Auth0Client();
```

### `/proxy.ts` (Next.js 16 — NOT middleware.ts)
```ts
import { auth0 } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

> The function name must match the file name: `proxy.ts` → `export async function proxy`.

### Auth routes (v4 defaults — no config needed)
| Route | Purpose |
|---|---|
| `/auth/login` | Redirect to Auth0 login |
| `/auth/logout` | Log out |
| `/auth/callback` | OAuth callback |

> Auth0 dashboard → **Allowed Callback URLs**: `http://localhost:3000/auth/callback`

### Getting the user in API routes
```ts
import { auth0 } from "@/lib/auth";

const session = await auth0.getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const userId = session.user.sub; // always use sub as MongoDB owner key
```

---

## MongoDB

### Collections

| Model | Collection | Purpose |
|---|---|---|
| `Conversation` | `conversations` | Chat history per user |
| `UserMemory` | `usermemories` | AI memory snippets per user |
| `UserPreference` | `userpreferences` | User preferences |
| `UserTone` | `usertones` | User tone settings |
| `UserUsage` | `userusages` | Usage tracking |

### Conversation schema
```ts
// models/conversation.ts
MessageSchema: { role, content, createdAt }
ConversationSchema: { userId, title, messages[], createdAt, updatedAt }
// userId = session.user.sub
```

### Reset all data
Drop these 5 collections: `conversations`, `usermemories`, `userpreferences`, `usertones`, `userusages`

---

## API Route — Chat (`/app/api/chat/route.ts`)

Key patterns:

```ts
import { createMCPClient } from "@ai-sdk/mcp";
import { streamText, stepCountIs, convertToModelMessages } from "ai";

// Convert UIMessage[] → ModelMessage[] before passing to streamText
const modelMessages = await convertToModelMessages(uiMessages);

// MCP client (create per request, close in onFinish)
const mcpClient = await createMCPClient({
  transport: { type: "sse", url: process.env.MCP_SERVER_URL!, headers: { Authorization: `Bearer ${process.env.MCP_SECRET}` } }
});
const mcpTools = await mcpClient.tools();

const result = streamText({
  model: anthropic("claude-sonnet-4-6"),
  system: SYSTEM_PROMPT,
  messages: modelMessages,
  tools: mcpTools,
  stopWhen: stepCountIs(5),          // was maxSteps in v4
  onFinish: async ({ text }) => {
    await mcpClient.close();
    // save to MongoDB here (never during streaming)
  },
});

return result.toUIMessageStreamResponse();  // was toDataStreamResponse() in v4
```

---

## Frontend — Chat Window (`/components/chat-window.tsx`)

AI SDK v6 `useChat` changes from v4:

```ts
import { useChat } from "@ai-sdk/react";          // NOT "ai/react"
import { DefaultChatTransport } from "@ai-sdk/react";

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({            // api/body moved here
    api: "/api/chat",
    body: { conversationId },
  }),
  messages: initialMessages,                       // was initialMessages in v4
});

// Sending a message
sendMessage({ text: inputValue });                 // no handleSubmit/handleInputChange

// Loading state
const isStreaming = status === "submitted" || status === "streaming";
```

---

## MCP Integration

```ts
import { createMCPClient } from "@ai-sdk/mcp";

const client = await createMCPClient({
  transport: {
    type: "sse",
    url: process.env.MCP_SERVER_URL!,
    headers: { Authorization: `Bearer ${process.env.MCP_SECRET}` },
  },
});

const tools = await client.tools();
// pass tools to streamText
await client.close(); // always close in onFinish
```

All tools exposed by the MCP server are available to Claude automatically — no manual tool definitions needed.

---

## Branding (shadcn/ui + Tailwind v4)

Tailwind v4 uses CSS imports — **no `tailwind.config.ts`**.

Set brand colors in `/app/globals.css`:
```css
:root {
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --radius: 0.75rem;
}
```

---

## Dev Checklist

- [ ] Auth0 tenant created, callback URL set: `http://localhost:3000/auth/callback`
- [ ] `.env.local` filled with all secrets
- [ ] MongoDB cluster running, IP whitelist includes dev machine
- [ ] MCP server reachable (SSE endpoint live, secret valid)
- [ ] `npm run dev` → visiting `/` redirects to Auth0 login at `/auth/login`
- [ ] Login completes, redirect back to `/chat`
- [ ] Send a message → streaming response appears in real time
- [ ] MCP tool query → tool-call indicator shows, result returned
- [ ] Conversation saves to MongoDB after response completes
- [ ] Sidebar shows past conversations on refresh

---

## Common Gotchas

**Never save to MongoDB during streaming** — only in `onFinish`. Chunks are partial text.

**Always use `session.user.sub` as `userId`** — never trust userId sent from the client.

**`proxy.ts` not `middleware.ts`** — Next.js 16 uses the file name as the export name. Function must be `export async function proxy(...)`.

**Auth0 v4 callback is `/auth/callback`** — NOT `/api/auth/callback` like v3. Update your Auth0 dashboard.

**`toUIMessageStreamResponse()`** — not `toDataStreamResponse()`. Required for `DefaultChatTransport` in AI SDK v6.

**`stepCountIs(5)`** — not `maxSteps: 5`. Import `stepCountIs` from `ai`.

---

*Stack: Next.js 16 · AI SDK v6 · @auth0/nextjs-auth0 v4 · Mongoose · claude-sonnet-4-6*
