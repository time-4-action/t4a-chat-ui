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

## CI/CD

`.github/workflows/deploy.yml` (workflow `ci`) runs `check` → `deploy` → `verify`.

**check** runs on every pull request and every push to `main`: `npm ci`,
`npm run typecheck` and `npm run build`. `npm run lint` is not
part of the check yet: the code has pre-existing lint errors (mostly
`no-explicit-any`) to clear first. A newer push to a pull
request cancels its running check; runs on `main` are queued, so pushes deploy
strictly in order.

**deploy** runs only on `main` after a green check, one at a time. It builds the
image on GitHub Actions with the commit SHA baked in as `APP_VERSION`, pushes
`ghcr.io/time-4-action/t4a-chat-ui:<sha>` and `:latest` to GitHub Container
Registry, then SSHes to the VM as `deploy` and, in
`/data/stack/apps/time-4-action/chat` (override with the `DEPLOY_DIR` repository
variable):

1. records the image the running `ai-agent-ui` container uses;
2. logs in to `ghcr.io` with the job's own `GITHUB_TOKEN` (valid only while the
   job runs; logged out again on exit, so the VM stores no registry
   credential), `docker compose pull ai-agent-ui` (three attempts) and
   `docker compose up -d` with `APP_IMAGE` exported to the new SHA;
3. waits up to 60 s for `http://127.0.0.1:3003/healthz` to answer 200;
4. checks the container reports `APP_VERSION` equal to the commit SHA.

If 3 or 4 fails it prints the logs, rolls back to the recorded image and fails
the run. **verify** then requests `/healthz` on the public URL
(`https://chat.time-4-action.com`, override with the `PRODUCTION_URL`
repository variable).

`/healthz` (`app/healthz/route.ts`) is excluded from the auth proxy
(`proxy.ts`) and does not touch MongoDB, so a database outage never triggers a
rollback.

The deploy only swaps images. `.env.local` and `docker-compose.yaml` on the
server are edited by hand; the server copy of the compose file is
`deploy/docker-compose.yaml` (the root one is for local builds). To go back to
an older release, re-run that commit's workflow, or on the server:
`export APP_IMAGE=ghcr.io/time-4-action/t4a-chat-ui:<sha> && docker compose up -d`
(a `docker login ghcr.io` first if the package is private).

### GitHub settings

The image lives in GHCR as `ghcr.io/time-4-action/t4a-chat-ui`. Pushing and
pulling use the workflow's `GITHUB_TOKEN` (`packages: write` on the deploy job),
so there is no registry secret. The `org.opencontainers.image.source` label in
the Dockerfile links the package to this repository.

Organization secrets (shared with the other time-4-action repos on this VM),
which must be made available to this repository:

| Secret                    | Value |
| ------------------------- | ----- |
| `PROD_DEPLOY_HOST`        | The VM's hostname or IP |
| `PROD_DEPLOY_SSH_KEY`     | Private key whose public half is in `deploy`'s `authorized_keys` |
| `PROD_DEPLOY_FINGERPRINT` | `SHA256:…` from `ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub` |

The deploy job uses the `production` environment; create it in the repository
settings (optionally with required reviewers).

Repository variables (baked into the client bundle at build time, replacing the
values `scripts/build.bat` reads from `.env.local`): `NEXT_PUBLIC_APP_NAME`,
`NEXT_PUBLIC_COMPANY_COLOR`, `NEXT_PUBLIC_DEEPGRAM_API_KEY`. Unset ones build
empty, as they do locally.

The SSH user is `deploy` unless the `DEPLOY_USER` repository variable names
another. It must be in the `docker` group, be able to write the server
directory, and have `curl`.

### Server setup (once)

The server's `docker-compose.yaml` must be `deploy/docker-compose.yaml`. A copy
with a `build:` section or a fixed `image:` tag ignores `APP_IMAGE`, so every
deploy would fail its `APP_VERSION` check and roll back. `.env.local` sits
beside it and holds the runtime secrets (`ANTHROPIC_API_KEY`, `AUTH0_*`,
`MONGODB_URI`, …). The service keeps the name `ai-agent-ui`, so the first
deploy takes over the container that was started by hand.

### Dependency updates

`.github/dependabot.yml` opens at most one grouped pull request per ecosystem a
month (npm minor + patch, GitHub Actions); each goes through `check` like any
other pull request. Major npm versions are left to a deliberate upgrade.

### Manual build (Windows)

`scripts/build.bat` / `scripts/push.bat` still build and push
`time4action/t4a-chat-ui` to Docker Hub from `.env.local`. Production no longer
uses that image.

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
- [ ] GitHub secrets, variables and `production` environment set (see CI/CD)
- [ ] `ci` workflow green on `main` (deploy + verify)
- [ ] Login flow works end-to-end
- [ ] MCP tools respond correctly

---

## Monitoring

### Health Checks

- **Liveness:** `GET /healthz` returns `ok` (no auth, no MongoDB)
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
