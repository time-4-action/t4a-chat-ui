# Architecture

System design, technology choices, and data flow for the time-4-action AI chat application.

---

## High-Level Architecture

```
                          ┌─────────────────┐
                          │   Auth0 Tenant  │
                          │  (Identity +    │
                          │   RBAC roles)   │
                          └────────┬────────┘
                                   │ JWT tokens
                                   ▼
┌──────────┐    HTTPS    ┌─────────────────────────┐
│  Browser │ ◄─────────► │     Next.js 16 App      │
│  (React) │  streaming  │                         │
└──────────┘             │  proxy.ts (auth gate)   │
                         │  app/api/chat (engine)   │
                         │  app/api/* (CRUD)        │
                         └────┬──────┬──────┬──────┘
                              │      │      │
                    ┌─────────┘      │      └──────────┐
                    ▼                ▼                  ▼
             ┌────────────┐  ┌────────────┐    ┌──────────────┐
             │  Anthropic │  │  MongoDB   │    │  MCP Server  │
             │  Claude AI │  │  (Atlas)   │    │ (MetaKocka)  │
             │            │  │            │    │              │
             │ Opus/      │  │ Convos     │    │ Products     │
             │ Sonnet/    │  │ Prefs      │    │ Orders       │
             │ Haiku      │  │ Memory     │    │ Partners     │
             └────────────┘  │ Usage      │    │ Warehouse    │
                             │ Tones      │    │ Delivery     │
                             │ Gmail      │    └──────────────┘
                             └────────────┘
                                                ┌──────────────┐
                                                │  Gmail MCP   │
                                                │  Server      │
                                                │              │
                                                │ Read emails  │
                                                │ Create drafts│
                                                └──────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | 20+ |
| **Framework** | Next.js (App Router) | 16 |
| **React** | React | 19 |
| **AI SDK** | Vercel AI SDK | 6 |
| **AI Provider** | @ai-sdk/anthropic | 3 |
| **MCP Client** | @ai-sdk/mcp | 1 |
| **Auth** | @auth0/nextjs-auth0 | 4 |
| **Database** | MongoDB + Mongoose | 9 |
| **UI** | shadcn/ui (New York) | - |
| **CSS** | Tailwind CSS | 4 |
| **Icons** | lucide-react | - |
| **Markdown** | react-markdown + remark-gfm | - |
| **File parsing** | pdf-lib, mammoth, xlsx | - |
| **Export** | docx, pptxgenjs, pdf-lib | - |
| **Rich text** | react-quill-new | - |
| **Voice** | Deepgram (STT), Web Speech API (TTS) | - |

---

## Request Flow

### Chat Request (Happy Path)

```
Browser                   Next.js                    Auth0             MCP Server
  │                          │                         │                   │
  │── POST /api/chat ───────►│                         │                   │
  │                          │── auth0.getSession() ──►│                   │
  │                          │◄── session + userId ────│                   │
  │                          │                         │                   │
  │                          │── auth0.getAccessToken()►│                   │
  │                          │◄── JWT access token ────│                   │
  │                          │                         │                   │
  │                          │── createMCPClient(JWT) ─────────────────►  │
  │                          │◄── available tools ─────────────────────   │
  │                          │                         │                   │
  │                          │── streamText(Claude + tools) ──►           │
  │                          │   [Claude calls tools as needed]            │
  │◄── streaming response ───│                         │                   │
  │                          │                         │                   │
  │                          │── onFinish:                                │
  │                          │   save to MongoDB                          │
  │                          │   update user memory                       │
  │                          │   track usage & cost                       │
  │                          │   close MCP client                         │
```

### Authentication Flow

```
Browser ──► proxy.ts ──► auth0.middleware()
                             │
                ┌────────────┴───────────────┐
                │                            │
          /auth/* routes              All other routes
          (pass through)                     │
                                    Decode session JWT
                                    Extract roles claim
                                             │
                                    ┌────────┴────────┐
                                    │                 │
                              Has "ai" role    Missing "ai" role
                              (allow through)  (→ /unauthorized)
```

---

## Project Structure

```
app/
├── layout.tsx                       # Auth0Provider, Geist fonts, metadata
├── page.tsx                         # Redirect → /chat
├── unauthorized/page.tsx            # 403 page for users without "ai" role
├── chat/
│   ├── layout.tsx                   # Sidebar + chat area layout
│   ├── page.tsx                     # Redirect /chat → /chat/new
│   ├── new/page.tsx                 # Fresh conversation page
│   └── [id]/page.tsx                # Load conversation by ID
├── settings/
│   ├── layout.tsx                   # Settings sidebar layout
│   └── page.tsx                     # Preferences, integrations, tones
├── capabilities/page.tsx            # Available MCP tools & categories
└── api/
    ├── chat/route.ts                # Core AI streaming engine
    ├── conversations/
    │   ├── route.ts                 # GET (list), POST (create)
    │   └── [id]/route.ts            # GET, PATCH (rename), DELETE
    ├── gmail/
    │   ├── connect/route.ts         # OAuth redirect to Google
    │   ├── callback/route.ts        # OAuth callback, store token
    │   ├── disconnect/route.ts      # Revoke + delete token
    │   ├── status/route.ts          # Connection status
    │   └── attachment/route.ts      # Download attachments
    ├── preferences/
    │   ├── route.ts                 # GET/POST user preferences
    │   └── autofill/route.ts        # Auto-fill from Auth0
    ├── tones/
    │   ├── route.ts                 # GET/POST tone profiles
    │   └── [id]/route.ts            # GET/PATCH/DELETE individual tone
    ├── memory/route.ts              # GET/PUT persistent AI memory
    ├── usage/route.ts               # Usage stats & costs
    ├── mcp/status/route.ts          # MCP server health check
    ├── parse-file/route.ts          # Server-side file parsing
    ├── stt/route.ts                 # Speech-to-text (Deepgram)
    ├── tts/route.ts                 # Text-to-speech
    └── export/route.ts              # Export (DOCX/PDF/PPTX/MD)

components/
├── chat-window.tsx                  # Main chat UI with useChat hook
├── message-bubble.tsx               # Message rendering with markdown
├── tool-call-indicator.tsx          # MCP tool call loading spinner
├── conversation-sidebar.tsx         # Conversation list with grouping
├── model-selector.tsx               # Claude model switcher
├── tone-selector.tsx                # Writing tone selector
├── chat-mode-selector.tsx           # Email/quick-info/normal modes
├── voice-mode.tsx                   # Voice input (Deepgram)
├── email-card.tsx                   # Email JSON renderer
├── document-card.tsx                # Document attachment display
├── file-preview-panel.tsx           # File preview before sending
├── quill-editor.tsx                 # Rich text editor (emails)
├── create-tone-modal.tsx            # Tone profile creation
├── guided-tour.tsx                  # Onboarding walkthrough
├── install-prompt.tsx               # PWA install banner
├── network-status.tsx               # Online/offline indicator
└── ui/                              # shadcn/ui base components

lib/
├── auth.ts                          # Auth0Client singleton
├── mongodb.ts                       # Mongoose connection cache
├── utils.ts                         # cn() class combiner
├── models.ts                        # Model configs & cost calculations
├── capabilities.ts                  # MCP tool categories & metadata
├── gmail-crypto.ts                  # AES-256-GCM encrypt/decrypt
├── gmail-token.ts                   # Gmail access token helper
├── gmail-tools.ts                   # Gmail MCP tool definitions
├── tour-context.tsx                 # Guided tour state
├── tour-steps.ts                    # Tour step definitions
└── export/                          # Export generators (DOCX, PDF, PPTX)

models/
├── conversation.ts                  # Chat history schema
├── user-preference.ts               # Communication preferences
├── user-memory.ts                   # Persistent AI memory
├── user-tone.ts                     # Custom writing tone profiles
├── user-usage.ts                    # Token usage & cost tracking
├── user-gmail.ts                    # Encrypted Gmail tokens
└── user-limit.ts                    # Usage limit configurations
```

---

## Key Design Decisions

### Next.js 16 Middleware (`proxy.ts`)

Next.js 16 renamed `middleware.ts` to `proxy.ts`. The exported function name must match the filename:

```typescript
// proxy.ts — NOT middleware.ts
export async function proxy(request: NextRequest) { ... }
```

### AI SDK v6 Patterns

- `useChat()` imported from `@ai-sdk/react` (not `ai/react`)
- `DefaultChatTransport` replaces direct `api` prop
- `sendMessage()` replaces `handleSubmit()`
- `status` is `"submitted" | "streaming"` (not boolean `isLoading`)
- `toUIMessageStreamResponse()` replaces `toDataStreamResponse()`
- `stepCountIs(5)` replaces `maxSteps: 5`

### Tailwind CSS v4

No `tailwind.config.ts` file. Brand colors defined as CSS variables in `app/globals.css`. Uses `@tailwindcss/postcss` plugin.

### MCP Client Lifecycle

MCP clients are created per-request and closed in `onFinish`. This ensures clean connection handling and prevents leaked SSE connections.

### Prompt Caching

Uses Anthropic's ephemeral cache (5-minute TTL). `withCacheControl()` adds cache markers to the last message. Cache reads cost 10% of input price; writes cost 125%.

### Message Window

`applyMessageWindow()` keeps only the last 20 messages to stay within context limits. Always starts from a user message.

### Graceful MCP Degradation

If the MCP server is unreachable or returns errors, chat continues without tools. Users are never blocked from chatting.
