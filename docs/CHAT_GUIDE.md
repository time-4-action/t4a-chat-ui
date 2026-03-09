# Chat App — MCP Auth0 Integration

This guide covers what needs to be changed in **this Next.js chat app** so it passes a valid Auth0 access token to the MCP server on every request.

---

## Overview

Currently `app/api/chat/route.ts` creates the MCP client with no authentication:

```typescript
mcpClient = await createMCPClient({
  transport: { type: "sse", url: process.env.MCP_SERVER_URL },
});
```

We need to obtain an Auth0 **Management API / machine-to-machine access token** (or forward the user's own access token) and pass it as an `Authorization: Bearer <token>` header.

---

## Approach: Two Options

### Option A — Forward the User's Own Access Token (Recommended)

The user's Auth0 session already contains an access token. If that token is issued for the MCP server's audience, it will carry the user's actual permissions. This is the cleanest approach — the MCP server sees the real user's roles.

### Option B — Machine-to-Machine Token

The chat server obtains its own M2M token from Auth0 using client credentials and passes it to MCP. The MCP server then trusts the chat server and sees a service identity, not the user. This is simpler but loses per-user role checking — avoid unless you have a specific reason.

**This guide follows Option A.**

---

## 1. Configure Auth0 to Issue Tokens for the MCP Audience

The user's Auth0 session token must be issued for the MCP API audience.

In `lib/auth.ts` (Auth0 client config), add the MCP audience to the authorization parameters:

```typescript
// lib/auth.ts
import { Auth0Client } from "@auth0/nextjs-auth0";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email offline_access",
    audience: process.env.AUTH0_MCP_AUDIENCE, // e.g. https://mcp.your-company.com
  },
});
```

This tells Auth0 to include the MCP audience in the access token, which causes permissions/roles to be embedded.

---

## 2. Add `AUTH0_MCP_AUDIENCE` to `.env.local`

```env
AUTH0_MCP_AUDIENCE=https://mcp.your-company.com
```

This must match exactly what you set as the API identifier in the Auth0 Dashboard.

---

## 3. Extract the Access Token in the Chat Route

`auth0.getSession()` returns the session which includes `tokenSet.accessToken`. Pass it as a Bearer header to the MCP client.

In `app/api/chat/route.ts`, update the MCP client creation block:

```typescript
// Current (no auth):
mcpClient = await createMCPClient({
  transport: { type: "sse", url: process.env.MCP_SERVER_URL },
});

// Replace with:
const accessToken = session.tokenSet?.accessToken;

mcpClient = await createMCPClient({
  transport: {
    type: "sse",
    url: process.env.MCP_SERVER_URL,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  },
});
```

`session` is already available at the top of the POST handler — no extra lookup needed.

---

## 4. Full Diff — `app/api/chat/route.ts`

Only the MCP client creation block changes (around line 296–307):

```diff
  if (process.env.MCP_SERVER_URL) {
    try {
+     const accessToken = session.tokenSet?.accessToken;
      mcpClient = await createMCPClient({
-       transport: { type: "sse", url: process.env.MCP_SERVER_URL },
+       transport: {
+         type: "sse",
+         url: process.env.MCP_SERVER_URL,
+         headers: accessToken
+           ? { Authorization: `Bearer ${accessToken}` }
+           : undefined,
+       },
      });
      mcpTools = await mcpClient.tools();
    } catch (err) {
```

---

## 5. Token Expiry Considerations

Auth0 access tokens expire (default 24h, often shorter). The `@auth0/nextjs-auth0` SDK handles **silent refresh** automatically via the refresh token when `offline_access` scope is included (which it is in the config above). The session is refreshed transparently on each request, so `session.tokenSet.accessToken` is always fresh.

If for some reason the token is expired and refresh fails, `getSession()` will return `null` and the existing `401` guard at the top of the route will reject the request before MCP is called.

---

## 6. Summary of Changes in This App

| File | Change |
|---|---|
| `lib/auth.ts` | Add `audience: process.env.AUTH0_MCP_AUDIENCE` to `authorizationParameters` |
| `.env.local` | Add `AUTH0_MCP_AUDIENCE=https://mcp.your-company.com` |
| `app/api/chat/route.ts` | Extract `session.tokenSet?.accessToken` and pass as `Authorization` header to MCP client |

That's it — three targeted changes. No new dependencies required.
