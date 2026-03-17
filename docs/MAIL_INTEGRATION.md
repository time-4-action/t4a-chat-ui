# Gmail Integration — Architecture & Implementation Guide

## Overview

Each authenticated user can connect their own Gmail account via Google OAuth. The app stores an encrypted refresh token per user in MongoDB. On each chat request, the app exchanges the refresh token for a short-lived access token and passes it to the Gmail MCP server, which executes Gmail API calls on the user's behalf.

---

## Architecture

```
User              Next.js App                  Gmail MCP Server        Google
 |                     |                               |                   |
 |--[Connect Gmail]-→  |                               |                   |
 |              [/api/gmail/connect]                   |                   |
 |              [Google OAuth redirect]  ─────────────────────────────→    |
 |              [user consents]          ←─────────────────────────────    |
 |              [/api/gmail/callback]                  |                   |
 |              [code → refresh_token]   ─────────────────────────────→    |
 |              [encrypt + store in DB]  ←─────────────────────────────    |
 |                     |                               |                   |
 |--[Chat request]--→  |                               |                   |
 |              [decrypt refresh_token]                |                   |
 |              [exchange → access_token]─────────────────────────────→    |
 |              [createMCPClient({        ←─────────────────────────────   |
 |                url: GMAIL_MCP_URL,                  |                   |
 |                headers: {Bearer token}              |                   |
 |              })]────────────────────→  Gmail MCP   |                   |
 |                     |                  [calls Gmail API]                |
 |←──[AI response]─────|                               |                   |
```

---

## Approach: Separate Google OAuth in App

We use **Option B** (separate Google OAuth, independent of Auth0):

- Users explicitly click "Connect Gmail" in Settings → Integrations
- App handles the full OAuth flow and stores the encrypted `refresh_token` in MongoDB
- Users can disconnect Gmail at any time, which revokes the token at Google
- Gmail access is fully independent from Auth0 session — revoking Gmail does not affect login

**Why not Auth0 social connections?** Auth0 social connection tokens require the Management API (rate-limited on free plans), and revoking Gmail would require full logout. Separate OAuth gives full control.

---

## Files Created / Modified

| File | Purpose |
|------|---------|
| `models/user-gmail.ts` | Mongoose schema for encrypted Gmail tokens |
| `lib/gmail-crypto.ts` | AES-256-GCM encrypt/decrypt for refresh tokens |
| `lib/gmail-token.ts` | Helper to get fresh access token from stored refresh token |
| `app/api/gmail/connect/route.ts` | GET → redirects to Google OAuth consent screen |
| `app/api/gmail/callback/route.ts` | GET → exchanges code, stores encrypted token |
| `app/api/gmail/disconnect/route.ts` | DELETE → revokes token at Google, deletes from DB |
| `app/api/gmail/status/route.ts` | GET → returns connection status + email (no tokens) |
| `app/api/chat/route.ts` | Modified to attach Gmail MCP client when user has Gmail connected |
| `app/settings/page.tsx` | Added Integrations section with Connect/Disconnect UI |

---

## Environment Variables

Add to `.env.local`:

```env
# Google OAuth app (create at console.cloud.google.com)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# AES-256 encryption key for stored refresh tokens (any long random string)
GMAIL_TOKEN_ENCRYPTION_KEY=your_very_long_random_secret_at_least_32_chars

# Gmail MCP server URL (your own deployment or compatible server)
GMAIL_MCP_SERVER_URL=https://your-gmail-mcp-server.example.com/sse
```

---

## Google Cloud Console Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Gmail API** in APIs & Services → Library
4. Go to APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: **Web application**
6. Authorized redirect URIs: add `http://localhost:3000/api/gmail/callback` (dev) and your production URL
7. Copy `Client ID` and `Client Secret` to `.env.local`
8. Configure OAuth consent screen:
   - User type: External (or Internal if G Suite org)
   - Add scopes: `gmail.readonly`, `gmail.compose`
   - Add test users (dev) or submit for verification (prod)

---

## Authentication Flow (Step by Step)

### Connect
1. User clicks "Connect" in Settings → Integrations
2. Browser navigates to `/api/gmail/connect`
3. App builds Google OAuth URL with `access_type=offline` and `prompt=consent`
4. Google shows consent screen; user approves
5. Google redirects to `/api/gmail/callback?code=...&state=<userId>`
6. App verifies `state === session.user.sub` (CSRF protection)
7. App exchanges `code` for `{ access_token, refresh_token }` at `oauth2.googleapis.com/token`
8. App fetches user's Google email from `googleapis.com/oauth2/v2/userinfo`
9. App encrypts `refresh_token` with AES-256-GCM using `GMAIL_TOKEN_ENCRYPTION_KEY`
10. Encrypted token + IV + authTag stored in `UserGmail` collection
11. Redirect to `/settings?gmailConnected=true`

### Chat with Gmail tools
1. Chat request arrives at `/api/chat/route.ts`
2. `getGmailAccessToken(userId)` decrypts stored refresh token
3. Calls `oauth2.googleapis.com/token` with `grant_type=refresh_token`
4. Google returns short-lived `access_token` (1 hour TTL)
5. `createMCPClient` is called with `Authorization: Bearer <access_token>`
6. Gmail MCP server validates token against Google and executes tool calls
7. Access token is never stored — generated fresh each request

### Disconnect
1. User clicks "Disconnect" in Settings → Integrations
2. DELETE `/api/gmail/disconnect`
3. App decrypts stored refresh token
4. Calls `oauth2.googleapis.com/revoke?token=<refresh_token>` (POST)
5. Also exchanges refresh → access and revokes that too
6. Deletes `UserGmail` document from MongoDB

---

## Security

### Token storage
- `refresh_token` encrypted with **AES-256-GCM** before MongoDB storage
- `iv` (12 bytes, random per token) and `authTag` (16 bytes) stored alongside ciphertext
- Encryption key is in env var, never in code or DB
- `access_token` is **never stored** — generated on-demand, used once per request

### Token isolation
- Each request uses ONLY the requesting user's token
- `getGmailAccessToken(userId)` uses the authenticated session's `user.sub`
- Gmail MCP client is created per-request, closed in `onFinish`

### Scopes (principle of least privilege)
```
https://www.googleapis.com/auth/gmail.readonly   — read emails, threads, labels
https://www.googleapis.com/auth/gmail.compose    — create drafts (not send)
email                                            — get user's email address
```

To disable draft creation, remove `gmail.compose` from `GMAIL_SCOPES` in `connect/route.ts`.

### No sensitive logging
- Tokens never appear in `console.log`
- Status endpoint returns only `email` and `connectedAt`, never token data

### CSRF protection
- `state` parameter in OAuth flow is set to `session.user.sub`
- Callback verifies `state === session.user.sub` before proceeding

---

## Gmail MCP Server

The Gmail MCP server must:
- Accept `Authorization: Bearer <google_access_token>` header
- Validate the token against Google's tokeninfo endpoint or use it directly with Gmail API
- Expose tools compatible with AI SDK MCP client (SSE transport)

### Recommended tools to expose
| Tool | Scope needed |
|------|-------------|
| `gmail_search_messages` | `gmail.readonly` |
| `gmail_read_message` | `gmail.readonly` |
| `gmail_read_thread` | `gmail.readonly` |
| `gmail_list_labels` | `gmail.readonly` |
| `gmail_create_draft` | `gmail.compose` |

### Option A: Extend existing MCP server
Add Gmail tools to `mcp.time-4-action.com`. Accept `Authorization: Bearer <google_access_token>` and use it for Gmail API calls.

### Option B: Dedicated Gmail MCP server
Deploy a standalone server. Community options:
- Build with `@modelcontextprotocol/sdk` + `googleapis` npm package
- The server receives the user's access token in the header and uses it directly

---

## Testing Checklist

- [ ] Google Cloud Console: OAuth app created, Gmail API enabled, redirect URI added
- [ ] `.env.local`: all four new vars set
- [ ] Dev: `npm run dev` → navigate to Settings → Integrations
- [ ] Connect flow: click Connect → Google consent → redirected back with success message
- [ ] MongoDB: verify `UserGmail` document exists with encrypted fields (no plaintext token visible)
- [ ] Chat: ask "Show me my latest email" → Gmail tools appear in tool call indicator
- [ ] Disconnect: click Disconnect → token revoked at Google → `UserGmail` document deleted
- [ ] Auth isolation: log in as User B → verify User B cannot see User A's emails

---

## Known Limitations

- **No token refresh on expiry during long streams** — access tokens last 1 hour; very long chat sessions might hit expiry mid-stream. Mitigation: generate token right before MCP client creation (already done).
- **First connection only gets refresh_token** — if user previously connected and the token was not stored (e.g. during testing), they must revoke app access in Google Account → Security → Third-party apps and reconnect. The `prompt=consent` parameter forces re-consent and a new refresh_token.
- **Rate limits** — Gmail API has per-user quotas (1B units/day). Each read/search typically costs 1-5 units. Normal usage is well within limits.
