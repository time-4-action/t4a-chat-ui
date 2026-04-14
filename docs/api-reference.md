# API Reference

Complete reference for all API routes, page components, and library modules.

---

## API Routes

### POST `/api/chat`

The core AI streaming engine. Receives messages, connects to Claude via Vercel AI SDK, integrates MCP tools, and streams responses.

**Request body:**

```json
{
  "messages": [...],
  "conversationId": "string",
  "model": "claude-sonnet-4-6",
  "mode": "normal | email | quick-info",
  "toneId": "string (optional)"
}
```

**Flow:**
1. Authenticate user via Auth0 session
2. Load conversation history from MongoDB
3. Connect to MCP server and fetch available tools
4. Build personalized system prompt (preferences, memory, tone)
5. Call `streamText()` with Claude + MCP tools
6. Stream response to client in real time
7. On finish: save conversation, update memory, track usage

**Response:** Server-Sent Events stream via `toUIMessageStreamResponse()`

**Key internal functions:**

| Function | Purpose |
|----------|---------|
| `buildSystemPrompt(userId, toneId?)` | Constructs personalized system prompt |
| `updateMemorySummary(userId, user, assistant)` | Extracts context via Haiku, updates memory |
| `truncateToolResults(messages)` | Caps tool responses at 6,000 chars |
| `applyMessageWindow(messages)` | Keeps last 20 messages in context |
| `withCacheControl(messages)` | Adds ephemeral cache markers |
| `htmlToMarkdown(html)` | Converts HTML signatures to markdown |

**Constants:**

| Name | Value | Purpose |
|------|-------|---------|
| `MAX_TOOL_RESULT_CHARS` | 6000 | Tool result truncation limit |
| `MAX_HISTORY_MESSAGES` | 20 | Context window message cap |

---

### GET `/api/conversations`

Returns the last 50 conversations for the authenticated user, sorted by `updatedAt` descending.

**Response:**
```json
[
  { "_id": "...", "title": "...", "createdAt": "...", "updatedAt": "..." }
]
```

### POST `/api/conversations`

Creates a new empty conversation for the authenticated user.

**Response:** Full conversation object.

---

### GET `/api/conversations/[id]`

Loads a single conversation by ID. Validates ownership (user must own the conversation).

### PATCH `/api/conversations/[id]`

Renames a conversation. Body: `{ "title": "New Title" }`.

### DELETE `/api/conversations/[id]`

Deletes a conversation. Validates ownership before deletion.

---

### GET `/api/gmail/connect`

Redirects the user to Google OAuth consent screen with `gmail.readonly`, `gmail.compose`, and `email` scopes. Uses `access_type=offline` and `prompt=consent` to ensure a refresh token.

### GET `/api/gmail/callback`

Handles the OAuth callback from Google. Exchanges the authorization code for tokens, encrypts the refresh token with AES-256-GCM, and stores it in MongoDB.

### DELETE `/api/gmail/disconnect`

Revokes the Google token and deletes the encrypted token from MongoDB.

### GET `/api/gmail/status`

Returns Gmail connection status and email address. Never exposes tokens.

### GET `/api/gmail/attachment`

Downloads an email attachment by message ID and attachment ID.

---

### GET/POST `/api/preferences`

- **GET**: Returns user communication preferences
- **POST**: Creates or updates preferences (personal info, communication style, email templates, custom instructions)

### POST `/api/preferences/autofill`

Auto-fills preference fields from Auth0 profile claims (name, email, etc.).

---

### GET/POST `/api/tones`

- **GET**: Lists all tone profiles for the user
- **POST**: Creates a new tone profile (AI generates the system prompt)

### GET/PATCH/DELETE `/api/tones/[id]`

Manage individual tone profiles. PATCH updates fields; DELETE removes the tone.

---

### GET/PUT `/api/memory`

- **GET**: Returns persistent AI memory (work context, personal context, top of mind, recent activity)
- **PUT**: Updates memory fields

---

### GET `/api/usage`

Returns per-model usage statistics (tokens, messages, costs) and total cumulative cost.

---

### GET `/api/mcp/status`

Health check for the MCP server. Returns connectivity status.

---

### POST `/api/parse-file`

Server-side file parsing for DOCX, XLSX, XLS, and ODS files. Returns extracted text content.

### POST `/api/export`

Exports a conversation to the specified format. Supported formats: DOCX, PDF, PPTX, Markdown.

### POST `/api/stt`

Speech-to-text transcription via Deepgram API.

---

## Page Components

### `app/layout.tsx` — RootLayout

Root application wrapper. Provides `Auth0Provider`, loads Geist fonts, sets metadata and favicon.

### `app/chat/layout.tsx`

Chat area layout with sidebar. Handles responsive sidebar toggle.

### `app/chat/[id]/page.tsx` — ConversationPage

Loads a conversation from MongoDB with ownership check. Converts stored messages to `UIMessage[]` format (including file attachments) and renders `ChatWindow`.

### `app/settings/page.tsx`

User settings page with sections for personal preferences, communication style, email templates, custom instructions, Gmail integration, and tone profiles.

### `app/capabilities/page.tsx`

Displays all available MCP tool categories with descriptions and required permissions.

### `app/unauthorized/page.tsx`

Shown when a logged-in user lacks the `ai` role. Provides contact information and sign-out link.

---

## UI Components

### ChatWindow

Main chat interface. Manages input, file attachments, model/mode/tone selection, and real-time streaming via `useChat()` hook.

**Features:**
- Drag-and-drop file upload
- Image preview (data URL), document chips
- Real-time cost display per message
- Retry logic for rate limits (429) and network errors
- Voice input integration

### MessageBubble

Renders individual messages with full markdown support (GFM, syntax highlighting). Detects and renders email JSON output via `EmailCard`. Auto-fences CSV/TSV data as tables.

### ToolCallIndicator

Animated loading spinner shown during MCP tool calls. Displays human-readable labels like "Products lookup..." or "Accessing company data..." based on the tool name.

### ConversationSidebar

Left sidebar with conversation history grouped by date (Today, Yesterday, Previous 7 days, Older). Supports inline rename and delete.

---

## Library Modules

### `lib/auth.ts`

Auth0Client singleton with `openid profile email offline_access` scopes and MCP audience.

### `lib/mongodb.ts`

Mongoose connection cache. Reuses existing connections in dev mode to prevent duplicate connections during hot reload.

### `lib/models.ts`

Model configurations for Claude Opus, Sonnet, and Haiku. Includes `calculateRequestCost()` for per-request cost tracking with cache-aware pricing.

### `lib/capabilities.ts`

MCP tool categories and metadata. `getCategoryForTool(toolName)` maps tool names to display categories.

### `lib/gmail-crypto.ts`

AES-256-GCM encryption/decryption for Gmail refresh tokens. Uses random IV per token.

### `lib/gmail-token.ts`

Exchanges encrypted refresh tokens for fresh Google access tokens. Tokens are never stored — generated on demand.

### `lib/utils.ts`

`cn()` utility — Tailwind class combiner using `clsx` + `tailwind-merge`.
