# Getting Started

Step-by-step guide to set up the time-4-action AI chat application for local development.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required for Next.js 16 |
| npm | 10+ | Comes with Node.js |
| MongoDB | 7+ | Atlas (cloud) or local instance |
| Auth0 tenant | - | Free tier works for development |
| Anthropic API key | - | [console.anthropic.com](https://console.anthropic.com/) |

---

## 1. Clone & Install

```bash
git clone <repository-url>
cd t4a-chat-ui
npm install
```

---

## 2. Environment Variables

Create `.env.local` in the project root:

```bash
# ── Anthropic (required) ────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── MongoDB (required) ──────────────────────────────
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/t4a-chat

# ── Auth0 (required) ────────────────────────────────
AUTH0_SECRET=<random 64+ character string>
AUTH0_BASE_URL=http://localhost:3000
AUTH0_ISSUER_BASE_URL=https://your-tenant.eu.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_MCP_AUDIENCE=https://api.time-4-action.com

# ── MCP Server (optional) ──────────────────────────
MCP_SERVER_URL=https://mcp.time-4-action.com/mcp

# ── OpenAI (optional fallback) ─────────────────────
OPENAI_API_KEY=sk-...

# ── Google OAuth / Gmail (optional) ────────────────
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GMAIL_TOKEN_ENCRYPTION_KEY=your_very_long_random_secret_at_least_32_chars
GMAIL_MCP_SERVER_URL=https://gmail-mcp.time-4-action.com/sse

# ── Deepgram / Voice (optional) ────────────────────
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_key

# ── Branding (optional) ────────────────────────────
NEXT_PUBLIC_APP_NAME=time-4-action AI
NEXT_PUBLIC_COMPANY_COLOR=#0f172a
```

---

## 3. Auth0 Configuration

### Create Application

1. Go to **Auth0 Dashboard** → Applications → Create Application
2. Type: **Regular Web Application**
3. Settings:
   - **Allowed Callback URLs**: `http://localhost:3000/auth/callback`
   - **Allowed Logout URLs**: `http://localhost:3000`
   - **Allowed Web Origins**: `http://localhost:3000`

### Create API (for MCP)

1. Go to **Applications → APIs → Create API**
2. Identifier: `https://api.time-4-action.com` (must match `AUTH0_MCP_AUDIENCE`)
3. Enable RBAC + "Add Permissions in the Access Token"

### Add Roles Action

Create a **Post-Login Action** that injects roles into tokens:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const roles = event.authorization?.roles ?? [];
  api.idToken.setCustomClaim("https://time-4-action.com/roles", roles);
  api.accessToken.setCustomClaim("https://time-4-action.com/roles", roles);
};
```

### Assign the `ai` Role

1. Go to **User Management → Roles** → create a role named `ai`
2. Assign this role to any user who should access the chat application
3. Assign operational roles (`viewer`, `sales_rep`, etc.) for MCP tool access

See [Authentication](authentication.md) for the full Auth0 setup guide.

---

## 4. MongoDB Setup

1. Create a MongoDB cluster (e.g., [MongoDB Atlas](https://www.mongodb.com/atlas))
2. Create a database user with read/write access
3. Whitelist your development IP
4. Copy the connection string to `MONGODB_URI` in `.env.local`

Collections are created automatically on first use. See [Database](database.md) for schema details.

---

## 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to Auth0 login.

---

## Dev Checklist

- [ ] Auth0 tenant created, callback URL set to `http://localhost:3000/auth/callback`
- [ ] Post-Login Action deployed (injects roles into tokens)
- [ ] `ai` role created and assigned to your user
- [ ] `.env.local` configured with all required variables
- [ ] MongoDB cluster running, IP whitelisted
- [ ] `npm run dev` starts without errors
- [ ] Login flow completes (Auth0 → redirect back to `/chat`)
- [ ] Send a message — streaming response appears
- [ ] MCP tools work (if `MCP_SERVER_URL` configured)
- [ ] Conversation persists in sidebar on refresh

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Redirect loop on login | Wrong callback URL | Set to `/auth/callback` (not `/api/auth/callback`) |
| `[MCP] token is opaque` | Missing `AUTH0_MCP_AUDIENCE` | Set the env var, then log out and back in |
| MongoDB connection fails | IP not whitelisted | Add your IP to Atlas Network Access |
| MCP tools missing | MCP server unreachable | Chat works without tools — check `MCP_SERVER_URL` |
| `proxy.ts` not working | Wrong export name | Function must be `export async function proxy()` |

---

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```
