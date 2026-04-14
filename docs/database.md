# Database

MongoDB collections, Mongoose schemas, and data model documentation.

---

## Connection

```typescript
// lib/mongodb.ts
import mongoose from "mongoose";

let cached = (global as any).mongoose || { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(process.env.MONGODB_URI!);
  cached.conn = await cached.promise;
  return cached.conn;
}
```

The connection is cached via `global` to prevent duplicate connections during Next.js dev mode hot reloads.

---

## Collections

| Collection | Model | Purpose |
|------------|-------|---------|
| `conversations` | Conversation | Chat history per user |
| `userpreferences` | UserPreference | Communication preferences |
| `usermemories` | UserMemory | Persistent AI memory |
| `usertones` | UserTone | Custom writing tone profiles |
| `userusages` | UserUsage | Token usage & cost tracking |
| `usergmails` | UserGmail | Encrypted Gmail tokens |
| `userlimits` | UserLimit | Usage limit configurations |

All collections are created automatically on first use.

---

## Schemas

### Conversation

Stores chat history per user. Each conversation contains an array of messages.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Auth0 user sub, **indexed** |
| `title` | String | Default: "New Chat" |
| `messages` | Array | Embedded message documents |
| `messages[].role` | String | `"user"` or `"assistant"` |
| `messages[].content` | String | Message text |
| `messages[].createdAt` | Date | Auto-set |
| `messages[].files` | Array | Optional file attachments |
| `messages[].files[].mediaType` | String | MIME type |
| `messages[].files[].filename` | String | Original filename |
| `messages[].files[].url` | String | Data URL (images only) |
| `model` | String | Last used model ID |
| `totalCostUsd` | Number | Accumulated cost in USD |
| `createdAt` | Date | Auto-managed |
| `updatedAt` | Date | Auto-managed |

---

### UserPreference

Stores per-user communication preferences.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | **Unique**, indexed |
| `personalInfo.name` | String | Display name |
| `personalInfo.jobTitle` | String | Job title |
| `personalInfo.company` | String | Company name |
| `personalInfo.roleDescription` | String | Role description |
| `communicationStyle.tone` | String | Default tone |
| `communicationStyle.formality` | String | Formality level |
| `communicationStyle.signatureStyle` | String | HTML email signature |
| `emailTemplates` | String | Custom email templates |
| `customInstructions` | String | Free-form AI instructions |

---

### UserMemory

Persistent AI memory, updated automatically after each chat turn via Claude Haiku.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | **Unique**, indexed |
| `workContext` | String | Role, projects, tools |
| `personalContext` | String | Location, hobbies, interests |
| `topOfMind` | String | Current focus areas |
| `recentActivity` | String | Recent tasks and work |

---

### UserTone

Custom writing tone profiles created by users.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Indexed |
| `name` | String | Tone display name |
| `description` | String | Tone description |
| `tags` | String[] | Style tags |
| `examples` | String | Example writing samples |
| `customPrompt` | String | User-written prompt |
| `characteristics` | String | Style characteristics |
| `generatedPrompt` | String | AI-generated system prompt |
| `isActive` | Boolean | Currently selected tone |

---

### UserUsage

Tracks cumulative token usage and cost per user per model.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | Composite unique with `modelId` |
| `modelId` | String | Claude model identifier |
| `conversationCount` | Number | Total conversations |
| `inputTokens` | Number | Cumulative input tokens |
| `outputTokens` | Number | Cumulative output tokens |
| `cacheReadTokens` | Number | Prompt cache reads |
| `cacheCreationTokens` | Number | Prompt cache writes |
| `totalCostUsd` | Number | Permanent cost accumulator |

---

### UserGmail

Encrypted Gmail OAuth tokens.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | **Unique** |
| `encryptedRefreshToken` | String | AES-256-GCM encrypted |
| `email` | String | Google account email |
| `createdAt` | Date | Connection timestamp |
| `lastUsed` | Date | Last access timestamp |

---

### UserLimit

Configurable usage limits per user.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | String | **Unique** |
| `dailyLimit` | Number | USD per day |
| `weeklyLimit` | Number | USD per week |
| `monthlyLimit` | Number | USD per month |
| `totalLimit` | Number | USD total |
| `period` | String | `"daily"`, `"weekly"`, `"monthly"`, or `"total"` |

---

## Data Isolation

All MongoDB queries are scoped to the authenticated user:

```typescript
const session = await auth0.getSession();
const userId = session.user.sub;

// Every query includes userId filter
const conversations = await Conversation.find({ userId });
```

The `userId` is **always** derived from the server-side Auth0 session (`session.user.sub`), never from client input.

---

## Reset All Data

To clear all application data, drop these collections:

```
conversations, userpreferences, usermemories, usertones, userusages, usergmails, userlimits
```
