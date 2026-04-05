# Auth0 Roles & User Data — How It Works

This document explains end-to-end how user identity and roles flow from Auth0 into the application and the MCP server.

---

## 1. Overview

The app uses **@auth0/nextjs-auth0 v4** with a two-tier authorization model:

| Layer | Where it runs | What it enforces |
|-------|--------------|-----------------|
| App gate | `proxy.ts` (Next.js middleware) | User must have the `ai` role to access the app |
| Tool-level RBAC | MCP server | Roles determine which tools/data a user can access |

---

## 2. Auth0 Client Setup (`lib/auth.ts`)

```typescript
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email offline_access",
    audience: process.env.AUTH0_MCP_AUDIENCE,
  },
});
```

- `openid profile email` — standard OIDC claims (name, email, picture, sub)
- `offline_access` — requests a refresh token so sessions survive token expiry
- `audience: AUTH0_MCP_AUDIENCE` — requests an access token scoped to the MCP API (`https://api.time-4-action.com`); this is what allows the access token to carry MCP permissions

---

## 3. Adding Roles to Tokens — Auth0 Action

Roles are **not** included in tokens by default. An Auth0 Action (Post-Login trigger) injects them as a custom claim on both the ID token and the access token:

```javascript
// Auth0 Dashboard → Actions → Post-Login trigger
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.idToken.setCustomClaim("https://time-4-action.com/roles", roles);
  api.accessToken.setCustomClaim("https://time-4-action.com/roles", roles);
};
```

**Why a namespaced claim?**
Auth0 requires custom JWT claims to use a URL namespace (not a plain string like `roles`) to avoid conflicts with standard claims. The namespace `https://time-4-action.com/roles` is just a convention — it doesn't need to resolve to a real URL.

**Where roles are assigned:**
Auth0 Dashboard → User Management → Users → (select user) → Roles tab.
Or programmatically via the Auth0 Management API.

---

## 4. Auth Routes (v4 — No `handleAuth`)

In Auth0 v4 there is **no `handleAuth()` export** — routes are handled automatically by the middleware (proxy). The standard routes are:

| URL | Purpose |
|-----|---------|
| `/auth/login` | Redirects to Auth0 Universal Login |
| `/auth/callback` | Handles the OAuth callback, sets session cookie |
| `/auth/logout` | Clears session, logs out from Auth0 |

The Auth0 dashboard **callback URL must be** `http://localhost:3000/auth/callback` (not `/api/auth/callback` as in v3).

---

## 5. Middleware Role Gate (`proxy.ts`)

Every incoming request passes through `proxy.ts` before reaching any page or API route.

```
Incoming request
      │
      ▼
auth0.middleware()   ← handles /auth/* routes, refreshes tokens, sets session cookie
      │
      ▼
Is route /auth/* or /unauthorized?  ──yes──▶ pass through
      │ no
      ▼
Decode session JWT payload
Extract roles from "https://time-4-action.com/roles" claim
      │
      ▼
roles.includes("ai")?  ──no──▶ redirect to /unauthorized
      │ yes
      ▼
Pass through to the route
```

Simplified code:

```typescript
const ROLES_CLAIM = "https://time-4-action.com/roles";

export async function proxy(request: NextRequest) {
  const authResponse = await auth0.middleware(request);

  // Let Auth0 routes and the unauthorized page through
  if (request.nextUrl.pathname.startsWith("/auth") ||
      request.nextUrl.pathname === "/unauthorized") {
    return authResponse;
  }

  // Decode the session token to read roles
  const cookie = request.cookies.get("appSession")?.value;
  const payload = decodeJwtPayload(cookie); // base64-decode middle segment
  const roles: string[] = payload?.[ROLES_CLAIM] ?? [];

  if (!roles.includes("ai")) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return authResponse;
}
```

**Important:** The roles are read from the **session cookie** (ID token), not from an API call, so this check adds no latency.

---

## 6. Session & User Identity in API Routes

All API routes use the same pattern to identify the current user:

```typescript
import { auth0 } from "@/lib/auth";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.sub; // Auth0 user ID, e.g. "auth0|64a3..."
  // ... query MongoDB filtered by userId
}
```

`session.user` contains standard OIDC claims:

| Claim | Value |
|-------|-------|
| `sub` | Unique Auth0 user ID (`auth0|...`) — used as `userId` in all MongoDB models |
| `name` | Display name |
| `email` | Email address |
| `picture` | Avatar URL |
| `https://time-4-action.com/roles` | Array of role strings |

All MongoDB models store `userId: session.user.sub` as an indexed field so every query is scoped to the authenticated user.

---

## 7. Access Token for MCP Server (`app/api/chat/route.ts`)

When the user sends a chat message, the server fetches an access token and passes it to the MCP server:

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

- `getAccessToken()` returns the cached access token, automatically refreshing it if expired (made possible by the `offline_access` scope)
- The access token contains the `https://time-4-action.com/roles` claim and the `permissions` claim
- The MCP server validates this token and uses the claims to apply tool-level RBAC

---

## 8. MCP Server Token Validation

The MCP server validates the Bearer token on every request:

1. **Fetch JWKS** — downloads Auth0's public signing keys from `https://time-4-action.eu.auth0.com/.well-known/jwks.json` (cached in-process)
2. **Verify signature** — RS256 signature check using the public key
3. **Verify claims:**
   - `audience` must equal `AUTH0_MCP_AUDIENCE`
   - `issuer` must equal `https://time-4-action.eu.auth0.com/`
   - `exp` must be in the future
4. **Check tool permissions** — reads the `permissions` claim from the token and compares to a `TOOL_PERMISSIONS` map

Example:

```
Tool: identify_product
Required permission: products:read
Token permissions: ["products:read", "documents:read"]
Result: ✅ allowed
```

Admins have `admin:all` which bypasses all permission checks.

---

## 9. Role Definitions

### App-Level Role

| Role | Effect |
|------|--------|
| `ai` | Grants access to the chat application. Without this role, all routes redirect to `/unauthorized`. |

### Operational Roles (MCP server)

| Role | Permissions |
|------|------------|
| `viewer` | `documents:read`, `products:read`, `warehouse:read` |
| `sales_rep` | viewer + `documents:create`, `documents:update`, `products:create` |
| `warehouse_op` | viewer + `warehouse:stock_sync`, `warehouse:update` |
| `accountant` | viewer + `documents:create`, billing access |
| `manager` | All of the above + `documents:delete`, `products:delete` |
| `admin` | `admin:all` — unrestricted access to all tools |

Roles are assigned in the Auth0 dashboard and flow into tokens via the Post-Login Action (see §3).

---

## 10. Client-Side Auth (`app/layout.tsx`)

```typescript
import { Auth0Provider } from "@auth0/nextjs-auth0/client";

export default function RootLayout({ children }) {
  return (
    <Auth0Provider>
      {children}
    </Auth0Provider>
  );
}
```

`Auth0Provider` makes the session available to client components via `useUser()` hook from `@auth0/nextjs-auth0/client`. Client components can read `user.sub`, `user.email`, etc., but roles are typically only enforced server-side.

---

## 11. Environment Variables

```bash
AUTH0_SECRET=           # Random secret for session cookie encryption
AUTH0_BASE_URL=         # App base URL, e.g. http://localhost:3000
AUTH0_ISSUER_BASE_URL=  # Auth0 tenant URL, e.g. https://time-4-action.eu.auth0.com
AUTH0_CLIENT_ID=        # Auth0 application Client ID
AUTH0_CLIENT_SECRET=    # Auth0 application Client Secret
AUTH0_MCP_AUDIENCE=     # API identifier, e.g. https://api.time-4-action.com
```

---

## 12. Full Request Flow (Happy Path)

```
Browser                 Next.js (proxy.ts)         Auth0            MCP Server
   │                          │                       │                  │
   │── GET /chat ────────────▶│                       │                  │
   │                          │── auth0.middleware() ─▶│                  │
   │                          │◀─ session cookie ──────│                  │
   │                          │                       │                  │
   │                          │ decode JWT → roles = ["ai", "manager"]   │
   │                          │ roles.includes("ai") → ✅               │
   │◀─ 200 /chat ─────────────│                       │                  │
   │                          │                       │                  │
   │── POST /api/chat ────────▶│                       │                  │
   │                          │ auth0.getSession() → userId              │
   │                          │ auth0.getAccessToken() → JWT             │
   │                          │──── Bearer JWT ───────────────────────▶ │
   │                          │                       │ verify JWT       │
   │                          │                       │ check permissions│
   │                          │◀─── tool results ──────────────────────  │
   │◀─ streamed response ─────│                       │                  │
```
