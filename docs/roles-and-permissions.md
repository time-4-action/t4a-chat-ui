# Roles & Permissions

Complete role definitions and permission matrix for the time-4-action AI application.

---

## Role Hierarchy

```
admin          ── unrestricted, bypasses all checks
  └── manager  ── full operational access
        ├── sales_rep      ── sales operations
        ├── warehouse_op   ── warehouse & fulfillment
        └── accountant     ── finance & billing
              └── viewer   ── read-only access
```

All users must also have the `ai` role to access the application itself.

---

## App-Level Role

| Role | Effect |
|------|--------|
| `ai` | Grants access to the chat application. Without this role, all routes redirect to `/unauthorized`. Independent from operational roles. |

---

## Operational Roles

### viewer

Read-only access across core operations. For stakeholders, auditors, external observers.

| Permission | Description |
|-----------|-------------|
| `documents:read` | View all document types |
| `sales_orders:read` | View sales orders |
| `offers:read` | View sales offers |
| `purchase_orders:read` | View purchase orders |
| `work_orders:read` | View work orders |
| `warehouse:read` | View warehouse data |
| `warehouse_docs:read` | View warehouse documents |
| `transfer_orders:read` | View transfer orders |
| `products:read` | View products |
| `partners:read` | View partners |
| `complaints:read` | View complaints |
| `delivery:tracking:read` | View delivery tracking |
| `files:read` | View file attachments |
| `bills:read` | View bills/invoices |

---

### sales_rep

Day-to-day sales work — offers, orders, customers, delivery.

*Includes all `viewer` permissions plus:*

| Permission | Description |
|-----------|-------------|
| `documents:create` | Create documents |
| `documents:update` | Update documents |
| `documents:status_change` | Change document status |
| `sales_orders:create` | Create sales orders |
| `sales_orders:update` | Update sales orders |
| `offers:create` | Create offers |
| `offers:update` | Update offers |
| `products:partner_codes:read` | View partner product codes |
| `products:source_stock:read` | View external stock sources |
| `partners:create` | Create partners |
| `partners:update` | Update partners |
| `partners:blacklist:read` | Check blacklist |
| `complaints:create` | File complaints |
| `complaints:update` | Update complaints |
| `delivery:pricelists:read` | View delivery prices |
| `reports:read` | View reports |
| `files:upload` | Upload files |
| `attachments:write` | Add attachments |
| `messages:send` | Send messages |
| `webshop:abandoned_carts:read` | View abandoned carts |

---

### warehouse_op

Warehouse & fulfillment operations.

*Includes document read permissions plus:*

| Permission | Description |
|-----------|-------------|
| `documents:status_change` | Change document status |
| `sales_orders:change_warehouse` | Reassign warehouse |
| `sales_orders:mark_shipped` | Mark orders as shipped |
| `work_orders:create` | Create work orders |
| `work_orders:update` | Update work orders |
| `warehouse:stock_sync` | Sync warehouse stock |
| `warehouse:import_inventory` | Import inventory data |
| `warehouse_docs:create` | Create warehouse documents |
| `warehouse_docs:update` | Update warehouse documents |
| `transfer_orders:create` | Create transfers |
| `transfer_orders:update` | Update transfers |
| `products:source_stock:read` | View external stock |
| `delivery:pricelists:read` | View delivery prices |
| `delivery:stickers:generate` | Generate shipping stickers |
| `files:upload` | Upload files |
| `attachments:write` | Add attachments |

---

### accountant

Finance, billing, payments, exports, FURS.

*Includes document read permissions plus:*

| Permission | Description |
|-----------|-------------|
| `bills:create` | Create bills |
| `bills:update` | Update bills |
| `bills:send_to_furs` | Submit bills to FURS |
| `bills:export_accounting` | Export accounting data |
| `payments:read` | View payments |
| `payments:create` | Record payments |
| `transactions:write` | Write transactions |
| `bank_statements:read` | View bank statements |
| `bank_statements:status` | Check statement status |
| `bank_compensation:read` | View compensations |
| `cash_register:read` | View cash register |
| `reports:read` | View reports |
| `reports:async` | Run async reports |
| `files:upload` | Upload files |
| `attachments:write` | Add attachments |

---

### manager

Full operational access across all domains. No system/infrastructure tools.

*Includes all permissions from viewer, sales_rep, warehouse_op, and accountant, plus:*

| Permission | Description |
|-----------|-------------|
| `documents:delete` | Delete documents |
| `sales_orders:delete` | Delete sales orders |
| `sales_orders:forbidden_products` | Manage forbidden products |
| `products:create` | Create products |
| `products:update` | Update products |
| `products:partner_codes:write` | Write partner codes |
| `products:partner_codes:delete` | Delete partner codes |
| `partners:blacklist:write` | Manage blacklist |
| `webshop:terms_of_use:write` | Update terms of use |
| `webshop:abandoned_carts:write` | Manage abandoned carts |

---

### admin

Unrestricted access. Bypasses all permission checks on the MCP server.

| Permission | Description |
|-----------|-------------|
| `admin:all` | Wildcard — bypasses all RBAC checks |
| `products:delete` | Delete products |
| `webhooks:read` | View webhooks |
| `webhooks:write` | Create/update webhooks |
| `webhooks:delete` | Delete webhooks |

---

## Authorization Layers

| Layer | Where | What is checked |
|-------|-------|----------------|
| **Middleware** | `proxy.ts` | User has `ai` role in ID token |
| **API routes** | All `app/api/*/route.ts` | Valid Auth0 session exists |
| **Data isolation** | MongoDB queries | `userId === session.user.sub` |
| **Tool permissions** | MCP server | JWT `permissions` claim per tool |

---

## Managing Roles

### Auth0 Dashboard

1. **User Management → Roles** — create roles and assign permissions
2. **User Management → Users → [user] → Roles** — assign roles to users
3. **Applications → APIs → [MCP API] → Permissions** — define permission scopes

### Programmatic

Use the Auth0 Management API to assign roles programmatically.

### Post-Login Action

Roles must be injected into tokens via a Post-Login Action. See [Authentication](authentication.md) for setup.
