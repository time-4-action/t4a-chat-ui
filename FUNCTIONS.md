# FUNCTIONS.md — time-4-action AI Chat App

## What This App Is For

**time-4-action** is an internal AI-powered chat assistant built for company employees. It connects to your company's internal data systems via MCP (Model Context Protocol), allowing employees to ask natural language questions about products, orders, partners, warehouse stock, and deliveries — and get instant, context-aware answers.

Key capabilities:
- Chat with Claude (Anthropic) using company data as context
- Look up products, prices, stock, orders, invoices, and delivery tracking
- Compose emails, summaries, and quick info requests with custom tone profiles
- Upload files (images, PDFs, Excel, Word docs, CSV) for analysis
- Persistent memory — the AI remembers past context across sessions
- Auth0-secured with role-based access (`ai` role required)

---

## Architecture Overview

```
proxy.ts              → Auth0 middleware (guards all routes)
app/layout.tsx        → Auth0Provider + fonts
app/chat/page.tsx     → Redirects /chat → /chat/new
app/chat/[id]/page.tsx → Loads conversation, renders ChatWindow
app/api/chat/         → Streams AI responses (core engine)
app/api/conversations/ → CRUD for conversation history
components/           → UI components
lib/                  → Auth, DB, utilities, model configs
models/               → Mongoose schemas (MongoDB)
```

---

## API Routes

### `app/api/chat/route.ts`

The core AI engine. Receives messages, calls Claude via Vercel AI SDK v6, integrates MCP tools, and streams responses back.

#### `POST(req: NextRequest)`
Main streaming chat endpoint. Orchestrates the full AI pipeline:
1. Authenticates user via Auth0 session
2. Fetches conversation history from MongoDB
3. Connects to MCP server and fetches available tools
4. Builds personalized system prompt
5. Calls `streamText()` with Claude model + MCP tools
6. Saves updated conversation to MongoDB
7. Returns streaming response via `toUIMessageStreamResponse()`

#### `buildSystemPrompt(userId, toneId?): Promise<string>`
Constructs a personalized system prompt by combining:
- Base instructions (formatting rules, no emojis, table/list rules)
- User preferences (name, job title, company, communication style, email templates, custom instructions)
- User memory (work context, personal context, top of mind, recent activity)
- Active tone profile (if selected)
- Current date/time

#### `updateMemorySummary(userId, userMsg, assistantMsg)`
Called after each completed AI turn. Uses Claude Haiku to extract and update the user's persistent memory (recent activity, top of mind, etc.) stored in MongoDB.

#### `htmlToMarkdown(html): string`
Converts HTML (from user preference signature fields) into plain markdown for inclusion in the system prompt.

#### `truncateToolResults(messages)`
Prevents oversized MCP tool results from blowing up the context window. Truncates any tool result block exceeding 6,000 characters.

#### `applyMessageWindow(messages)`
Keeps only the last 20 messages in context, always starting from a user message (not a tool result or assistant turn).

#### `withCacheControl(messages)`
Adds Anthropic ephemeral cache control markers to the last message, enabling prompt caching and reducing API costs.

**Constants:**
| Name | Value | Purpose |
|------|-------|---------|
| `BASE_SYSTEM_PROMPT` | string | Core AI behavior instructions |
| `MODE_PROMPTS` | `{ email, quick-info }` | Mode-specific prompt overrides |
| `MAX_TOOL_RESULT_CHARS` | 6000 | Truncation limit for MCP results |
| `MAX_HISTORY_MESSAGES` | 20 | Context window message limit |

---

### `app/api/conversations/route.ts`

#### `GET()`
Returns the last 50 conversations for the authenticated user, sorted by most recently updated. Returns `{ _id, title, createdAt, updatedAt }` per conversation.

#### `POST()`
Creates a new conversation document in MongoDB for the authenticated user. Returns the full conversation object.

---

### `app/api/conversations/[id]/route.ts`

#### `GET(req, { params })`
Fetches a single conversation by ID. Validates that the conversation belongs to the authenticated user.

#### `PATCH(req, { params })`
Renames a conversation. Body: `{ title: string }`. Updates `title` and `updatedAt`.

#### `DELETE(req, { params })`
Deletes a conversation. Validates ownership before deleting.

---

## Page Components

### `app/layout.tsx` — `RootLayout({ children })`
Root app wrapper. Provides `<Auth0Provider>`, Geist fonts, metadata, favicon, and Tailwind v4 CSS variables.

### `app/chat/page.tsx` — `ChatIndexPage()`
Redirects `/chat` → `/chat/new` to always open a fresh conversation.

### `app/chat/[id]/page.tsx`

#### `ConversationPage({ params })`
Loads a conversation from MongoDB (with ownership check), converts stored messages to `UIMessage[]` format (including file attachments), then renders `<ChatWindow>`.

#### `generateMetadata({ params })`
Returns dynamic page metadata (`<title>`) based on the conversation title.

---

## UI Components

### `components/chat-window.tsx` — `ChatWindow({ conversationId, initialMessages, initialModel, initialCost })`
The main interactive chat interface. Responsibilities:
- Manages input text, attached files, chat mode, model selection, tone selection
- Uses `useChat()` from `@ai-sdk/react` with `DefaultChatTransport` for streaming
- Handles file uploads: images (data URL), PDFs (base64), text/markdown (inline), DOCX/XLSX/ODS (server-parsed)
- Drag-and-drop file attachment support
- Displays real-time token cost estimates per model
- Retry logic for rate limit (429), API, and network errors
- Voice input via `VoiceMode` component
- Mode selector: `email`, `quick-info`, `normal`
- Tone selector for writing style profiles

**Helper functions:**

| Function | Purpose |
|----------|---------|
| `formatBytes(bytes)` | Formats file size as B/KB/MB string |
| `getFileExt(file)` | Extracts file extension |
| `isImageFile(file)` | Returns true for image MIME types |
| `isPdfFile(file)` | Returns true for PDF |
| `isTextFile(file)` | Returns true for .txt/.md/text |
| `isServerParsedFile(file)` | Returns true for DOCX/XLSX/XLS/ODS |
| `isAcceptedFile(file)` | Returns true if file type is supported |

**Sub-components:**

| Component | Purpose |
|-----------|---------|
| `ImageChip({ attached, onRemove })` | Image preview thumbnail with remove button |
| `DocumentChip({ attached, onRemove })` | Document metadata chip (type, size, remove) |
| `FileChip({ attached, onRemove })` | Dispatches to ImageChip or DocumentChip |
| `ChatErrorBanner({ error, onDismiss, onRetry })` | Error notification with retry countdown |

---

### `components/message-bubble.tsx` — `MessageBubble({ message, signatureHtml })`
Renders a single chat message (user or assistant).
- **User messages**: shows attached images/documents above the text bubble
- **Assistant messages**: renders markdown with GFM support and syntax highlighting
- Detects email JSON output and renders via `EmailCard` component
- Shows animated placeholder while email JSON is still streaming

**Helper functions:**

| Function | Purpose |
|----------|---------|
| `parseDsvLine(line, sep)` | Parses a CSV or TSV line (handles quoted fields) |
| `autoFenceDsv(text)` | Auto-detects CSV/TSV blocks and wraps in markdown fences |
| `isEmailInProgress(text)` | Detects incomplete (still-streaming) email JSON |
| `docChipConfig(fp)` | Returns display config (label, color) for a file attachment type |

**Sub-components:**

| Component | Purpose |
|-----------|---------|
| `DsvTable({ content, sep })` | Renders CSV/TSV data as an HTML table |
| `CodeBlock({ language, children })` | Syntax-highlighted code block with copy button |

---

### `components/tool-call-indicator.tsx` — `ToolCallIndicator({ toolName })`
Shows an animated loading indicator while an MCP tool call is in progress. Displays a human-readable label like "**Products lookup…**" or "**Accessing company data…**" based on the tool name.

---

### `components/conversation-sidebar.tsx` — `ConversationSidebar({ open, onToggle, mobileClose })`
Left sidebar listing past conversations, grouped by date (Today, Yesterday, Previous 7 days, Older).

**Helper functions:**

| Function | Purpose |
|----------|---------|
| `groupConversations(conversations[])` | Organizes conversations into date buckets |
| `handleDelete(id, e)` | Deletes conversation; redirects if currently active |
| `saveRename(id)` | PATCHes new conversation title |
| `startRename(c, e)` | Enters inline rename edit mode |
| `cancelRename()` | Exits rename mode without saving |

Also includes: Settings link, Capabilities link, Request Improvement link, user profile card with logout, and feedback modal.

---

### `components/new-chat-button.tsx` — `NewChatButton({ collapsed })`
Button that navigates to `/chat/new` to start a fresh conversation. Supports a compact (icon-only) mode when the sidebar is collapsed.

---

## Library Modules

### `lib/auth.ts` — `auth0`
Singleton `Auth0Client` instance configured with `openid profile email offline_access` scopes.

---

### `lib/mongodb.ts` — `connectDB()`
Establishes and caches a Mongoose connection to MongoDB. Reuses an existing connection or pending promise to avoid duplicate connections across module reloads (important in Next.js dev mode).

---

### `lib/utils.ts` — `cn(...inputs)`
Tailwind class combiner using `clsx` + `tailwind-merge`. Merges and deduplicates class names safely.

---

### `lib/capabilities.ts`

#### `CAPABILITIES: CapabilityCategory[]`
Hardcoded list of 5 MCP tool categories shown on the Capabilities page:

| Category | What it covers |
|----------|---------------|
| **Products** | Search, price, stock, variants, webshop URLs |
| **Orders & Documents** | Sales/purchase/warehouse docs, invoices |
| **Partners** | Customer/supplier lookup, blacklist check |
| **Warehouse** | Stock levels across warehouses |
| **Delivery** | Tracking codes, carrier price lists |

#### `getCategoryForTool(toolName): CapabilityCategory | undefined`
Looks up which capability category a given MCP tool belongs to. Used by `ToolCallIndicator` to display a friendly label.

---

### `lib/models.ts`

#### `MODEL_CONFIGS`
Configuration for the three available Anthropic models:

| Model | Speed | Cost | Input / Output (per M tokens) |
|-------|-------|------|-------------------------------|
| `claude-opus-4-6` | Powerful | $$$ | $5 / $25 |
| `claude-sonnet-4-6` | Balanced | $$ | $3 / $15 (recommended) |
| `claude-haiku-4-5-20251001` | Fast | $ | $1 / $5 (default) |

#### `calculateRequestCost(modelId, noCacheInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens): number`
Calculates the USD cost of a single API request, accounting for:
- Standard input tokens
- Output tokens
- Cache reads (10% of input price)
- Cache writes (125% of input price — ephemeral 5-min cache)

#### `formatCost(usd): string`
Formats a USD cost value for display (e.g., `"$0.0012"`).

#### Other exports
- `ModelId` — union type of valid model ID strings
- `MODEL_ORDER` — display order for model selector UI
- `DEFAULT_MODEL` — `"claude-haiku-4-5-20251001"`

---

## Database Models (Mongoose / MongoDB)

### `models/conversation.ts` — `Conversation`
Stores chat history per user.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Auth0 user sub, indexed |
| `title` | String | Default: "New Chat" |
| `messages[].role` | "user" \| "assistant" | |
| `messages[].content` | String | |
| `messages[].files[].mediaType` | String | MIME type |
| `messages[].files[].filename` | String | |
| `messages[].files[].url` | String | Data URL (images only) |
| `model` | String | Last used model ID |
| `totalCostUsd` | Number | Accumulated cost in USD |
| `createdAt`, `updatedAt` | Date | Auto-managed |

---

### `models/user-preference.ts` — `UserPreference`
Stores per-user communication preferences.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Unique, indexed |
| `personalInfo.name` | String | |
| `personalInfo.jobTitle` | String | |
| `personalInfo.company` | String | |
| `personalInfo.roleDescription` | String | |
| `communicationStyle.tone` | String | |
| `communicationStyle.formality` | String | |
| `communicationStyle.signatureStyle` | String | HTML email signature |
| `emailTemplates` | String | Custom email templates |
| `customInstructions` | String | Free-form AI instructions |

---

### `models/user-memory.ts` — `UserMemory`
Persistent AI memory, updated automatically after each chat turn.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Unique, indexed |
| `workContext` | String | Role, projects, tools |
| `personalContext` | String | Location, hobbies |
| `topOfMind` | String | Current focus |
| `recentActivity` | String | Recent tasks and work |

---

### `models/user-usage.ts` — `UserUsage`
Tracks cumulative token usage and cost per user per model.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Composite unique index with modelId |
| `modelId` | String | |
| `conversationCount` | Number | |
| `inputTokens` | Number | |
| `outputTokens` | Number | |
| `cacheReadTokens` | Number | |
| `cacheCreationTokens` | Number | |
| `totalCostUsd` | Number | Permanent accumulator |

---

### `models/user-tone.ts` — `UserTone`
Stores custom writing tone profiles created by users.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Indexed |
| `name` | String | Tone display name |
| `description` | String | |
| `tags` | String[] | |
| `examples` | String | Example writing samples |
| `customPrompt` | String | User-written prompt |
| `characteristics` | String | Style characteristics |
| `generatedPrompt` | String | AI-generated system prompt |
| `isActive` | Boolean | Currently selected tone |

---

## Middleware

### `proxy.ts` — `proxy(request: NextRequest)`
Next.js 16 middleware (renamed from `middleware.ts`). Runs on every request.

1. Passes through `/auth/*` and `/unauthorized` routes without checking
2. Retrieves Auth0 session
3. Checks that the user has the `"ai"` role in the `https://time-4-action.com/roles` claim
4. Redirects unauthorized users to `/unauthorized`
5. Returns Auth0 middleware response (handles token refresh, cookie updates)

`config.matcher` covers all routes except Next.js static files and `_next` internals.
