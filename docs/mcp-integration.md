# MCP Integration

How the application connects to MCP servers, discovers tools, and authenticates requests.

---

## What is MCP?

**Model Context Protocol (MCP)** is a standardized protocol for connecting AI models to external tools and data sources. The application uses MCP to give Claude access to company data (products, orders, warehouse, etc.) via Server-Sent Events (SSE) transport.

---

## Architecture

```
Next.js App                                MCP Server (Python/FastAPI)
    │                                           │
    │── createMCPClient({                      │
    │     transport: "sse",                     │
    │     url: MCP_SERVER_URL,                  │
    │     headers: { Authorization: Bearer JWT } │
    │   })                                      │
    │                                           │
    │── mcpClient.tools()  ───────────────────► │ (returns tool definitions)
    │◄── { identify_product, get_product_price, │
    │      search_documents_tool, ... }         │
    │                                           │
    │── streamText({ tools: mcpTools })         │
    │   Claude decides which tools to call      │
    │   ──── tool call ─────────────────────►   │ (validates JWT, checks RBAC)
    │   ◄─── tool result ──────────────────     │
    │   (up to 5 agentic steps per request)     │
    │                                           │
    │── mcpClient.close()                       │
```

---

## Client-Side Implementation

### Creating the MCP Client

```typescript
// app/api/chat/route.ts
import { createMCPClient } from "@ai-sdk/mcp";

const { token: accessToken } = await auth0.getAccessToken();

mcpClient = await createMCPClient({
  transport: {
    type: "sse",
    url: process.env.MCP_SERVER_URL!,
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  },
});

const mcpTools = await mcpClient.tools();
```

### Passing Tools to Claude

```typescript
const result = streamText({
  model: anthropic(modelId),
  system: systemPrompt,
  messages,
  stopWhen: stepCountIs(5),  // max 5 tool-call rounds
  ...(Object.keys(mcpTools).length > 0 && { tools: mcpTools }),
});
```

Tools are only passed to `streamText` if any were successfully fetched. Claude decides autonomously when to call them.

### Graceful Degradation

```typescript
if (process.env.MCP_SERVER_URL) {
  try {
    // connect + get tools
  } catch (err) {
    console.warn("[chat] MCP unavailable, continuing without tools:", err.message);
    mcpClient = null;
    mcpTools = {};
  }
}
```

If `MCP_SERVER_URL` is not set or the connection fails, chat continues without tools. Users are never blocked.

### Client Lifecycle

MCP clients are created per-request and closed in `onFinish`:

```typescript
onFinish: async () => {
  await mcpClient?.close();
  // save to MongoDB, update memory, track usage
}
```

---

## Server-Side Authentication

The MCP server validates every request using Auth0 JWT tokens. See [Authentication](authentication.md) for the full flow.

**Summary:**
1. `AuthMiddleware` intercepts requests to `/mcp/*`
2. `verify_token()` validates the JWT (RS256 signature, audience, issuer, expiry)
3. `set_user()` stores validated claims in async context
4. `require_permission()` checks per-tool permissions before execution

---

## Tool-Level RBAC

Each tool has required permissions. The MCP server checks these against the JWT:

```python
TOOL_PERMISSIONS = {
    "identify_product":    ["products:read"],
    "get_product_stock":   ["warehouse:read"],
    "search_documents":    ["documents:read"],
    "get_partner":         ["partners:read"],
    # ...
}
```

Users with `admin:all` bypass all permission checks.

---

## Tool Result Handling

### Truncation

MCP tool results are capped at 6,000 characters to prevent context window bloat:

```typescript
function truncateToolResults(messages) {
  // Truncates any tool result block exceeding MAX_TOOL_RESULT_CHARS
}
```

### UI Indicators

The `ToolCallIndicator` component shows human-readable labels during tool execution:

| Tool name pattern | Display label |
|-------------------|---------------|
| `*product*` | "Products lookup..." |
| `*document*` | "Documents search..." |
| `*partner*` | "Partner lookup..." |
| `*warehouse*` | "Warehouse query..." |
| `*delivery*` / `*tracking*` | "Delivery tracking..." |
| Other | "Accessing company data..." |

---

## Gmail MCP Server

A separate MCP server handles Gmail integration. It uses Google OAuth tokens instead of Auth0 JWT:

```typescript
const gmailAccessToken = await getGmailAccessToken(userId);

gmailMcpClient = await createMCPClient({
  transport: {
    type: "sse",
    url: process.env.GMAIL_MCP_SERVER_URL!,
    headers: { Authorization: `Bearer ${gmailAccessToken}` },
  },
});
```

See [Gmail Integration](gmail-integration.md) for setup details.

---

## Environment Variables

```bash
MCP_SERVER_URL=https://mcp.time-4-action.com/mcp    # Main MCP server
GMAIL_MCP_SERVER_URL=https://gmail-mcp.../sse        # Gmail MCP server
```

---

## Debugging

### Token Issues

The chat route logs token debug info:

```
[MCP] token aud: ["https://api.time-4-action.com"] | exp: 2024-04-15T10:00:00Z
```

If you see `[MCP] token is opaque (not a JWT)`, it means `AUTH0_MCP_AUDIENCE` was not configured when the user logged in. Fix: set the env var, then the user must log out and back in.

### Connection Failures

MCP connection errors are logged but don't block chat:

```
[chat] MCP unavailable, continuing without tools: Connection refused
```

Check that `MCP_SERVER_URL` is reachable and the MCP server is running.
