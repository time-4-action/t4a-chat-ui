# Deployment

Docker build, container configuration, and production deployment guide.

---

## Docker Build

The application uses a 3-stage Dockerfile for minimal production images:

### Stage 1: Dependencies

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
```

### Stage 2: Build

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build
```

### Stage 3: Runner

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Key points:**
- Non-root user (`nextjs:nodejs`) for security
- Standalone output — no `node_modules` needed in production
- Only necessary files copied (public assets + Next.js standalone + static)
- ~100MB final image size

---

## Build & Push

### Using Docker directly

```bash
docker build -t etiamsi/t4a-ai-agent-ui:latest .
docker push etiamsi/t4a-ai-agent-ui:latest
```

### Using the build script (Windows)

```bash
./build-and-push.cmd
```

The PowerShell script reads `NEXT_PUBLIC_*` variables from `.env.local` and passes them as build args.

---

## Docker Compose

```yaml
services:
  ai-agent-ui:
    image: etiamsi/t4a-ai-agent-ui:latest
    network_mode: host
    env_file: .env.local
    environment:
      AUTH0_BASE_URL: https://chat.time-4-action.com
      PORT: 3003
    restart: unless-stopped
```

**Notes:**
- `network_mode: host` — uses the host's network stack (no port mapping needed)
- `env_file: .env.local` — loads all environment variables from file
- Override `AUTH0_BASE_URL` for production domain
- Override `PORT` if needed (default: 3000)

---

## Environment Variables

### Required

```bash
ANTHROPIC_API_KEY=sk-ant-...
MONGODB_URI=mongodb+srv://...
AUTH0_SECRET=<64+ char random string>
AUTH0_BASE_URL=https://chat.time-4-action.com
AUTH0_ISSUER_BASE_URL=https://time-4-action.eu.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_MCP_AUDIENCE=https://api.time-4-action.com
```

### Optional

```bash
MCP_SERVER_URL=https://mcp.time-4-action.com/mcp
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GMAIL_TOKEN_ENCRYPTION_KEY=...
GMAIL_MCP_SERVER_URL=https://gmail-mcp.../sse
NEXT_PUBLIC_DEEPGRAM_API_KEY=...
NEXT_PUBLIC_APP_NAME=time-4-action AI
NEXT_PUBLIC_COMPANY_COLOR=#0f172a
```

**Important:** `NEXT_PUBLIC_*` variables must be available at **build time** (they're inlined into the client bundle). Pass them as Docker build args or set them before `npm run build`.

---

## Next.js Configuration

```typescript
// next.config.ts
const nextConfig = {
  output: "standalone",           // Required for Docker deployment
  serverActions: {
    bodySizeLimit: "20mb",        // File upload limit
  },
};
```

- `standalone` output produces a self-contained server (no `node_modules`)
- `bodySizeLimit` set to 20MB for file uploads

---

## Production Checklist

- [ ] All required environment variables set
- [ ] `AUTH0_BASE_URL` points to the production domain
- [ ] Auth0 callback URL includes production domain (`https://your-domain.com/auth/callback`)
- [ ] MongoDB IP whitelist includes the server's IP
- [ ] MCP server reachable from the container
- [ ] `NEXT_PUBLIC_*` vars provided at build time
- [ ] Docker image built and pushed to registry
- [ ] Container starts and health check passes
- [ ] Login flow works end-to-end
- [ ] MCP tools respond correctly

---

## Monitoring

### Health Checks

- **App:** `GET /` should redirect to `/chat` (200 after auth)
- **MCP:** `GET /api/mcp/status` returns MCP server connectivity
- **Gmail:** `GET /api/gmail/status` returns per-user Gmail connection status

### Logs

The application logs key events to stdout:

```
[MCP] token aud: [...] | exp: 2024-04-15T10:00:00Z
[chat] MCP unavailable, continuing without tools: ...
[chat] Saved conversation <id> with <n> messages
[memory] Updated memory for user <userId>
```

### Cost Monitoring

Per-user costs are tracked in the `userusages` collection. Query via `/api/usage` or directly in MongoDB. Configurable limits can be set per user via the `userlimits` collection.
