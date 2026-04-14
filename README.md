<div align="center">

# time-4-action AI

**Enterprise AI Chat Assistant powered by Claude**

An internal chat application that connects employees to company data through natural language conversations. Built with Next.js 16, Anthropic Claude, and Model Context Protocol (MCP).

[Getting Started](docs/getting-started.md) · [Architecture](docs/architecture.md) · [API Reference](docs/api-reference.md) · [Deployment](docs/deployment.md)

---

</div>

## Overview

time-4-action AI is a production-ready enterprise chat interface that bridges the gap between employees and company data systems. Instead of navigating complex ERP interfaces, employees simply ask questions in natural language — the AI understands the intent, calls the appropriate backend tools, and returns formatted answers in real time.

```
"What's the current stock level for product X in Ljubljana warehouse?"
"Show me all unpaid invoices from last month"
"Draft an email to the supplier about delayed order PO-2024-0891"
```

The application integrates with **MetaKocka ERP** via MCP servers, enabling real-time access to products, orders, documents, partners, warehouse data, and delivery tracking — all secured with role-based access control.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Chat** | Real-time streaming conversations with Claude (Opus, Sonnet, Haiku) |
| **Company Data Access** | Query products, orders, invoices, stock levels, and partners via MCP tools |
| **Role-Based Security** | Auth0 authentication with per-tool RBAC — users only see what they're allowed to |
| **Gmail Integration** | Read emails and create drafts directly from the chat interface |
| **File Processing** | Upload and analyze PDFs, Word docs, Excel spreadsheets, and images |
| **Export** | Save conversations as DOCX, PDF, PowerPoint, or Markdown |
| **Voice Input** | Speech-to-text via Deepgram for hands-free interaction |
| **Persistent Memory** | AI remembers context across sessions — your work, preferences, and recent activity |
| **Custom Tone Profiles** | Create and switch between writing styles (formal, casual, creative) |
| **Usage Tracking** | Per-user token consumption and cost monitoring with configurable limits |
| **PWA Support** | Install as a desktop/mobile app with offline status indicators |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, standalone output) |
| **AI** | [Anthropic Claude](https://anthropic.com/) via [Vercel AI SDK v6](https://sdk.vercel.ai/) |
| **MCP Client** | [@ai-sdk/mcp](https://www.npmjs.com/package/@ai-sdk/mcp) (SSE transport) |
| **Authentication** | [Auth0](https://auth0.com/) (@auth0/nextjs-auth0 v4) |
| **Database** | [MongoDB](https://www.mongodb.com/) with [Mongoose](https://mongoosejs.com/) ODM |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com/) (New York) + [Tailwind CSS v4](https://tailwindcss.com/) |
| **Voice** | [Deepgram](https://deepgram.com/) (STT) + Web Speech API (TTS) |
| **Email** | Google Gmail API via separate OAuth flow |

---

## Project Structure

```
t4a-chat-ui/
├── app/
│   ├── layout.tsx                  # Root layout with Auth0Provider
│   ├── page.tsx                    # Redirect → /chat
│   ├── chat/                       # Chat pages (new, [id])
│   ├── settings/                   # User preferences & integrations
│   ├── capabilities/               # Available MCP tools overview
│   └── api/
│       ├── chat/                   # Core AI streaming engine
│       ├── conversations/          # CRUD for chat history
│       ├── gmail/                  # Gmail OAuth & attachment routes
│       ├── preferences/            # User settings
│       ├── tones/                  # Custom writing profiles
│       ├── memory/                 # Persistent AI memory
│       ├── usage/                  # Token & cost tracking
│       ├── export/                 # Conversation export (DOCX/PDF/PPTX)
│       ├── parse-file/             # Server-side file parsing
│       ├── stt/                    # Speech-to-text
│       └── mcp/status/             # MCP server health check
├── components/                     # React UI components
├── lib/                            # Auth, DB, utilities, model configs
├── models/                         # Mongoose schemas (7 collections)
├── docs/                           # Documentation
├── public/                         # Static assets, PWA manifest
├── proxy.ts                        # Auth0 middleware (Next.js 16)
├── Dockerfile                      # Multi-stage production build
└── docker-compose.yaml             # Container deployment config
```

---

## Quick Start

### Prerequisites

- **Node.js** 20+
- **MongoDB** cluster (Atlas or local)
- **Auth0** tenant with RBAC configured
- **Anthropic API** key

### Setup

```bash
# Clone and install
git clone <repository-url>
cd t4a-chat-ui
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials (see docs/getting-started.md)

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to Auth0 login.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `AUTH0_SECRET` | Yes | Random 64+ char string for session encryption |
| `AUTH0_BASE_URL` | Yes | App URL (e.g., `http://localhost:3000`) |
| `AUTH0_ISSUER_BASE_URL` | Yes | Auth0 tenant URL |
| `AUTH0_CLIENT_ID` | Yes | Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | Yes | Auth0 application client secret |
| `AUTH0_MCP_AUDIENCE` | Yes | MCP API audience identifier |
| `MCP_SERVER_URL` | No | MCP server SSE endpoint |
| `GOOGLE_CLIENT_ID` | No | Google OAuth (for Gmail) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth (for Gmail) |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | No | AES-256 key for Gmail token storage |
| `GMAIL_MCP_SERVER_URL` | No | Gmail MCP server endpoint |
| `NEXT_PUBLIC_DEEPGRAM_API_KEY` | No | Deepgram API key (voice input) |
| `NEXT_PUBLIC_APP_NAME` | No | Display name (default: "time-4-action AI") |
| `NEXT_PUBLIC_COMPANY_COLOR` | No | Brand primary color HSL |

See [Getting Started](docs/getting-started.md) for the full setup guide.

---

## Architecture

```
Browser ──► Next.js App ──► Auth0 (session + RBAC)
                │
                ├──► Anthropic Claude (AI streaming)
                │       └── MCP Tools (company data)
                │
                ├──► MongoDB (conversations, preferences, memory)
                │
                └──► Gmail MCP (email integration)
```

The application uses a **two-tier authorization model**:

1. **App Gate** — `proxy.ts` middleware checks for the `ai` role in the Auth0 session
2. **Tool-Level RBAC** — the MCP server validates JWT permissions per tool call

See [Architecture](docs/architecture.md) for the detailed system design.

---

## Available AI Models

| Model | Speed | Best For | Cost |
|-------|-------|----------|------|
| **Claude Haiku 4.5** | Fastest | Quick lookups, simple queries | $ |
| **Claude Sonnet 4.6** | Balanced | Most tasks (recommended) | $$ |
| **Claude Opus 4.6** | Most capable | Complex analysis, multi-step reasoning | $$$ |

---

## MCP Tools

The AI has access to company data through these tool categories:

| Category | Tools | Examples |
|----------|-------|---------|
| **Products** | 5 tools | Search products, check prices & stock, find variants |
| **Documents** | 4 tools | Search orders/invoices, get document details & URLs |
| **Partners** | 2 tools | Look up customers/suppliers, check blacklist |
| **Warehouse** | 2 tools | List warehouses, query stock across locations |
| **Delivery** | 2 tools | Track shipments, get carrier price lists |

See [MCP Tools Reference](docs/mcp-tools-reference.md) for the complete tool documentation.

---

## User Roles

| Role | Access Level |
|------|-------------|
| `viewer` | Read-only access to core data |
| `sales_rep` | Sales operations — orders, offers, partners |
| `warehouse_op` | Warehouse & fulfillment operations |
| `accountant` | Finance, billing, payments |
| `manager` | Full operational access |
| `admin` | Unrestricted — bypasses all permission checks |

See [Roles & Permissions](docs/roles-and-permissions.md) for the detailed permission matrix.

---

## Deployment

```bash
# Build Docker image
docker build -t t4a-chat-ui .

# Run with docker-compose
docker compose up -d
```

The Dockerfile uses a 3-stage build (deps → build → runner) producing a minimal standalone Next.js image. See [Deployment](docs/deployment.md) for production configuration.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Setup guide, environment variables, dev checklist |
| [Architecture](docs/architecture.md) | System design, tech stack, data flow |
| [API Reference](docs/api-reference.md) | All API routes and component documentation |
| [Authentication](docs/authentication.md) | Auth0 setup, JWT flow, RBAC implementation |
| [MCP Integration](docs/mcp-integration.md) | MCP server connection, tool discovery, auth flow |
| [MCP Tools Reference](docs/mcp-tools-reference.md) | Complete tool documentation with permissions |
| [Gmail Integration](docs/gmail-integration.md) | Google OAuth setup, token management, security |
| [Roles & Permissions](docs/roles-and-permissions.md) | Role definitions and permission matrix |
| [Database](docs/database.md) | MongoDB schemas and collections |
| [Deployment](docs/deployment.md) | Docker, build scripts, production config |

---

<div align="center">

Built with [Next.js](https://nextjs.org/) · [Anthropic Claude](https://anthropic.com/) · [Vercel AI SDK](https://sdk.vercel.ai/) · [Auth0](https://auth0.com/) · [MongoDB](https://www.mongodb.com/)

</div>
