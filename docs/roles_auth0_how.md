# How Auth0 Roles Work in This App

## Overview

This app uses Auth0 for authentication and role-based access control. There are two layers:

1. **App-level gate** — does the user have the `ai` role? (enforced in `proxy.ts`)
2. **Resource-level permissions** — what can the user do in the backend? (enforced by the MCP server via the access token)

---

## 1. Auth0 Client Setup (`lib/auth.ts`)

```ts
export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: "openid profile email offline_access",
    audience: process.env.AUTH0_MCP_AUDIENCE,
  },
});
```

- `scope: "openid profile email offline_access"` — requests an ID token, basic profile, and a refresh token.
- `audience: AUTH0_MCP_AUDIENCE` — requests an **access token** scoped to the MCP API. This is what allows the app to call the MCP server on behalf of the user.

The `audience` value must match the **API identifier** configured in your Auth0 dashboard for the MCP server.

---

## 2. Auth Flow Routes

Auth0 v4 handles login/logout/callback automatically via middleware. No route handlers needed.

| URL | What happens |
|-----|-------------|
| `/auth/login` | Redirects to Auth0 Universal Login |
| `/auth/callback` | Auth0 redirects back here after login; session is created |
| `/auth/logout` | Clears session and redirects to Auth0 logout |

Auth0 dashboard **must** have `http://localhost:3000/auth/callback` as an allowed callback URL.

---

## 3. App-Level Role Gate (`proxy.ts`)

Every request runs through `proxy.ts` (Next.js 16 middleware). Here is what it does:

```
request comes in
    │
    ├── path starts with /auth  →  pass through (let Auth0 handle it)
    ├── path is /unauthorized   →  pass through
    │
    ├── no session              →  Auth0 middleware redirects to /auth/login
    │
    └── session exists
            │
            ├── decode ID token JWT payload
            ├── read roles from custom claim: "https://time-4-action.com/roles"
            │
            ├── roles includes "ai"  →  allow request through
            └── roles missing "ai"   →  redirect to /unauthorized
```

### Why the ID token?

The roles live in the **ID token**, not the access token. The ID token is a JWT — the middleware decodes it locally (no network call) by base64-decoding the payload segment:

```ts
const idToken = session.tokenSet?.idToken;
const tokenPayload = JSON.parse(
  Buffer.from(idToken.split(".")[1], "base64url").toString()
);
const roles = tokenPayload["https://time-4-action.com/roles"] ?? [];
```

### How roles get into the ID token

This is configured in Auth0 via an **Action** (or Legacy Rule). The Action runs after login and adds the user's roles as a custom claim:

```js
// Auth0 Action (runs after login)
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.idToken.setCustomClaim("https://time-4-action.com/roles", roles);
  api.accessToken.setCustomClaim("https://time-4-action.com/roles", roles);
};
```

The claim namespace (`https://time-4-action.com/roles`) must be a URL to avoid conflicts — this is an Auth0 requirement for custom claims.

### The "ai" role

The `ai` role is a separate Auth0 role assigned to users who are allowed to use this chat application. It is independent from the operational roles (viewer, sales_rep, etc.). A user can have both `ai` and `sales_rep` assigned simultaneously.

---

## 4. Unauthorized Page (`app/unauthorized/page.tsx`)

If a logged-in user lacks the `ai` role, they land here. The page:
- Redirects unauthenticated users to `/auth/login` (so the URL cannot be accessed directly without a session)
- Shows an "Access Restricted" message
- Provides a contact email to request access
- Offers a sign-out link

---

## 5. API Route Auth (`app/api/*/route.ts`)

All API routes perform a server-side session check as a second layer of defense:

```ts
const session = await auth0.getSession();
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

The `session.user.sub` (Auth0 user ID) is used as the `userId` for all MongoDB queries, ensuring users can only access their own data. The client never sends a userId — it is always derived from the server-side session.

---

## 6. MCP Server Auth (`app/api/chat/route.ts`)

When calling the MCP server, the app forwards the user's Auth0 **access token**:

```ts
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

The MCP server validates this token and reads the roles/permissions claims from it to decide which tools the user is allowed to call. This is where the granular `resource:action` permissions defined in `ROLES.md` are actually enforced.

---

## Summary

| Layer | Where | What is checked |
|-------|-------|----------------|
| Middleware | `proxy.ts` | User has `ai` role in ID token |
| API routes | All `app/api/*/route.ts` | Valid session exists |
| Data isolation | MongoDB queries | `userId === session.user.sub` |
| Tool permissions | MCP server | Access token roles/permissions claims |

To grant a user access to the app: assign the `ai` role in the Auth0 dashboard. To control what data they can access via the AI: assign the appropriate operational role(s) (viewer, sales_rep, warehouse_op, accountant, manager, admin).
