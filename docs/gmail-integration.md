# Gmail Integration

Google OAuth setup, token management, and security model for the Gmail integration.

---

## Overview

Each authenticated user can connect their own Gmail account via Google OAuth. The app stores an encrypted refresh token per user in MongoDB. On each chat request, the app exchanges the refresh token for a short-lived access token and passes it to the Gmail MCP server.

---

## Architecture

```
User              Next.js App                 Gmail MCP Server       Google
 │                     │                             │                  │
 │──[Connect Gmail]──► │                             │                  │
 │              /api/gmail/connect                   │                  │
 │              Google OAuth redirect ──────────────────────────────►   │
 │              user consents          ◄──────────────────────────────  │
 │              /api/gmail/callback                  │                  │
 │              code → refresh_token   ──────────────────────────────►  │
 │              encrypt + store in DB  ◄──────────────────────────────  │
 │                     │                             │                  │
 │──[Chat request]───► │                             │                  │
 │              decrypt refresh_token                │                  │
 │              exchange → access_token──────────────────────────────►  │
 │              createMCPClient({       ◄──────────────────────────────│
 │                url: GMAIL_MCP_URL,                │                  │
 │                headers: Bearer token              │                  │
 │              }) ────────────────────► Gmail MCP    │                  │
 │                     │                calls Gmail API                 │
 │◄──[AI response]─────│                             │                  │
```

---

## Setup

### 1. Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable **Gmail API** in APIs & Services → Library
4. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: **Web application**
6. Authorized redirect URIs:
   - Dev: `http://localhost:3000/api/gmail/callback`
   - Prod: `https://your-domain.com/api/gmail/callback`
7. Copy Client ID and Client Secret

### 2. OAuth Consent Screen

- User type: External (or Internal for Google Workspace)
- Add scopes: `gmail.readonly`, `gmail.compose`
- Add test users during development
- Submit for verification for production

### 3. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GMAIL_TOKEN_ENCRYPTION_KEY=your_very_long_random_secret_at_least_32_chars
GMAIL_MCP_SERVER_URL=https://your-gmail-mcp-server.example.com/sse
```

---

## Authentication Flow

### Connect

1. User clicks "Connect Gmail" in Settings → Integrations
2. Browser navigates to `/api/gmail/connect`
3. App builds Google OAuth URL with `access_type=offline` and `prompt=consent`
4. Google shows consent screen; user approves
5. Google redirects to `/api/gmail/callback?code=...&state=<userId>`
6. App verifies `state === session.user.sub` (CSRF protection)
7. App exchanges `code` for `{ access_token, refresh_token }`
8. App fetches user's Google email from userinfo endpoint
9. App encrypts `refresh_token` with AES-256-GCM
10. Encrypted token stored in `UserGmail` collection
11. Redirect to `/settings?gmailConnected=true`

### Chat with Gmail Tools

1. Chat request arrives at `/api/chat`
2. `getGmailAccessToken(userId)` decrypts stored refresh token
3. Exchanges refresh token for short-lived access token (1 hour TTL)
4. Creates Gmail MCP client with `Authorization: Bearer <access_token>`
5. Gmail MCP server validates token and executes tool calls
6. Access token is **never stored** — generated fresh each request

### Disconnect

1. User clicks "Disconnect" in Settings → Integrations
2. DELETE `/api/gmail/disconnect`
3. App decrypts stored refresh token
4. Revokes token at Google (`oauth2.googleapis.com/revoke`)
5. Deletes `UserGmail` document from MongoDB

---

## Available Gmail Tools

| Tool | Scope Required | Description |
|------|---------------|-------------|
| `gmail_search_messages` | `gmail.readonly` | Search emails by query |
| `gmail_read_message` | `gmail.readonly` | Read a specific email |
| `gmail_read_thread` | `gmail.readonly` | Read an email thread |
| `gmail_list_labels` | `gmail.readonly` | List Gmail labels |
| `gmail_create_draft` | `gmail.compose` | Create an email draft |

---

## Security

### Token Storage
- Refresh tokens encrypted with **AES-256-GCM** before MongoDB storage
- Random 12-byte IV per token, 16-byte auth tag stored alongside ciphertext
- Encryption key in env var, never in code or database
- Access tokens **never stored** — generated on-demand, used once

### Token Isolation
- Each request uses only the requesting user's token
- `getGmailAccessToken(userId)` scoped to `session.user.sub`
- Gmail MCP client created per-request, closed in `onFinish`

### Scopes (Least Privilege)
```
gmail.readonly  — read emails, threads, labels
gmail.compose   — create drafts (not send)
email           — get user's email address
```

### CSRF Protection
- OAuth `state` parameter set to `session.user.sub`
- Callback verifies `state === session.user.sub` before proceeding

### No Sensitive Logging
- Tokens never appear in `console.log`
- Status endpoint returns only email and connection date

---

## Files

| File | Purpose |
|------|---------|
| `models/user-gmail.ts` | Mongoose schema for encrypted Gmail tokens |
| `lib/gmail-crypto.ts` | AES-256-GCM encrypt/decrypt |
| `lib/gmail-token.ts` | Refresh → access token exchange |
| `app/api/gmail/connect/route.ts` | OAuth redirect |
| `app/api/gmail/callback/route.ts` | OAuth callback |
| `app/api/gmail/disconnect/route.ts` | Revoke + delete |
| `app/api/gmail/status/route.ts` | Connection status |
| `app/api/gmail/attachment/route.ts` | Download attachments |

---

## Known Limitations

- **Long streams:** Access tokens last 1 hour. Very long chat sessions might hit expiry mid-stream. Mitigation: token generated right before MCP client creation.
- **Re-connection:** If a user previously connected and the token was lost, they must revoke app access in Google Account → Security → Third-party apps and reconnect. The `prompt=consent` parameter forces a new refresh token.
- **Rate limits:** Gmail API has per-user quotas (1B units/day). Normal usage is well within limits.
