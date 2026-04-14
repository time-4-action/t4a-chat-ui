# Authentication

Auth0 configuration, JWT flow, middleware, and role-based access control.

---

## Overview

The application uses **@auth0/nextjs-auth0 v4** with a two-tier authorization model:

| Layer | Where | What it enforces |
|-------|-------|-----------------|
| **App gate** | `proxy.ts` (middleware) | User must have the `ai` role to access the app |
| **Tool-level RBAC** | MCP server | Per-tool permission checks via JWT claims |

---

## Auth0 Client Configuration

```typescript
// lib/auth.ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email offline_access",
    audience: process.env.AUTH0_MCP_AUDIENCE,
  },
});
```

| Parameter | Purpose |
|-----------|---------|
| `openid profile email` | Standard OIDC claims (name, email, picture, sub) |
| `offline_access` | Requests a refresh token for silent token renewal |
| `audience` | Causes Auth0 to issue a JWT access token (not opaque) with MCP permissions |

---

## Auth Routes

Auth0 v4 handles routes automatically via middleware — no `handleAuth()` needed.

| URL | Purpose |
|-----|---------|
| `/auth/login` | Redirects to Auth0 Universal Login |
| `/auth/callback` | Handles OAuth callback, sets session cookie |
| `/auth/logout` | Clears session, logs out from Auth0 |

**Important:** The Auth0 dashboard callback URL must be `/auth/callback` (not `/api/auth/callback` as in v3).

---

## Middleware Role Gate

Every request passes through `proxy.ts` before reaching any page or API route:

```
Incoming request
      │
      ▼
auth0.middleware()       ← handles /auth/* routes, refreshes tokens
      │
      ▼
Is route /auth/* or /unauthorized?  ─── yes ──► pass through
      │ no
      ▼
Decode session JWT payload
Extract roles from "https://time-4-action.com/roles" claim
      │
      ▼
roles.includes("ai")?  ─── no ──► redirect to /unauthorized
      │ yes
      ▼
Pass through to the route
```

The roles are read from the **session cookie** (ID token), not from an API call — zero additional latency.

---

## Adding Roles to Tokens

Roles are not included in tokens by default. An Auth0 **Post-Login Action** injects them:

```javascript
// Auth0 Dashboard → Actions → Post-Login trigger
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.idToken.setCustomClaim("https://time-4-action.com/roles", roles);
  api.accessToken.setCustomClaim("https://time-4-action.com/roles", roles);
};
```

The namespace `https://time-4-action.com/roles` is required by Auth0 for custom claims (must be a URL to avoid conflicts with standard claims).

---

## Session & User Identity

All API routes use the same pattern to identify the current user:

```typescript
import { auth0 } from "@/lib/auth";

const session = await auth0.getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const userId = session.user.sub;  // Auth0 user ID, e.g. "auth0|64a3..."
```

`session.user` contains standard OIDC claims:

| Claim | Value |
|-------|-------|
| `sub` | Unique Auth0 user ID — used as `userId` in all MongoDB models |
| `name` | Display name |
| `email` | Email address |
| `picture` | Avatar URL |
| `https://time-4-action.com/roles` | Array of role strings |

All MongoDB queries are scoped to `userId: session.user.sub` — the client never sends a userId.

---

## Access Token for MCP Server

When calling the MCP server, the app forwards the user's Auth0 access token:

```typescript
const { token: accessToken } = await auth0.getAccessToken();

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

- `getAccessToken()` returns the cached token, automatically refreshing if expired
- The access token carries the `permissions` claim used for tool-level RBAC
- If no token is available, headers are omitted (MCP server returns 401)

---

## MCP Server Token Validation

The MCP server (Python/FastAPI) validates the Bearer token on every request:

1. **Fetch JWKS** — downloads Auth0's public signing keys (cached in-process via `lru_cache`)
2. **Verify signature** — RS256 signature check using the matched public key
3. **Verify claims:** `audience`, `issuer`, `exp`
4. **Check tool permissions** — reads `permissions` claim, compares to `TOOL_PERMISSIONS` map

```python
payload = jwt.decode(
    token,
    key,
    algorithms=["RS256"],
    audience=AUTH0_MCP_AUDIENCE,
    issuer=f"https://{AUTH0_DOMAIN}/",
)
```

---

## Full Request Flow

```
Browser              Next.js (proxy.ts)         Auth0           MCP Server
  │                        │                      │                 │
  │── GET /chat ──────────►│                      │                 │
  │                        │── auth0.middleware()─►│                 │
  │                        │◄── session cookie ───│                 │
  │                        │                      │                 │
  │                        │ decode JWT → roles = ["ai", "manager"] │
  │                        │ roles.includes("ai") → allow          │
  │◄── 200 /chat ──────────│                      │                 │
  │                        │                      │                 │
  │── POST /api/chat ─────►│                      │                 │
  │                        │ getSession() → userId                  │
  │                        │ getAccessToken() → JWT                 │
  │                        │──── Bearer JWT ──────────────────────► │
  │                        │                      │ verify JWT      │
  │                        │                      │ check permissions│
  │                        │◄──── tool results ───────────────────  │
  │◄── streamed response ──│                      │                 │
```

---

## Security Properties

| Property | Mechanism |
|----------|-----------|
| Token authenticity | RSA signature verified against Auth0's public JWKS |
| Token freshness | `exp` claim checked on every request |
| Audience binding | `aud` must equal `AUTH0_MCP_AUDIENCE` |
| Issuer binding | `iss` must equal your Auth0 tenant URL |
| Algorithm pinning | Only `RS256` accepted (prevents HS256 confusion) |
| Per-tool RBAC | `permissions` claim checked per tool call |
| Admin override | `admin:all` bypasses all permission checks |
| Context isolation | Python `ContextVar` keeps user data per async task |
| Session encryption | `AUTH0_SECRET` encrypts the Next.js session cookie |
| Graceful degradation | If MCP is down, chat continues without tools |

---

## Environment Variables

```bash
AUTH0_SECRET=           # Random 64+ char string for session cookie encryption
AUTH0_BASE_URL=         # App base URL (e.g., http://localhost:3000)
AUTH0_ISSUER_BASE_URL=  # Auth0 tenant URL (e.g., https://time-4-action.eu.auth0.com)
AUTH0_CLIENT_ID=        # Auth0 application Client ID
AUTH0_CLIENT_SECRET=    # Auth0 application Client Secret
AUTH0_MCP_AUDIENCE=     # API identifier (e.g., https://api.time-4-action.com)
```

---

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[MCP] token is opaque` | `AUTH0_MCP_AUDIENCE` not set when user logged in | Set env var, user must log out and back in |
| MCP 401 despite valid session | Token `aud` mismatch | Ensure `AUTH0_MCP_AUDIENCE` is identical on client and server |
| Token expired | `offline_access` scope missing | Add to `authorizationParameters.scope` in `lib/auth.ts` |
| Tool returns "Forbidden" | User missing required permission | Assign permission via Auth0 Dashboard → Roles |
| `kid` not found in JWKS | Auth0 rotated keys, old key cached | Restart MCP server process |
