# Architecture — Computer Room Manager

> Original system for managing public computer rooms, internet stations, study rooms,
> self-service kiosks and print centers. Multi-tenant SaaS, Hebrew/RTL first.

## 1. High-level overview

```
                         ┌─────────────────────────────┐
                         │        Web (Next.js)         │
                         │  Admin • Cashier • Kiosk PWA │
                         └───────────────┬─────────────┘
                                         │ HTTPS (REST) + WSS (Socket.IO)
                         ┌───────────────▼─────────────┐
                         │        API (NestJS)          │
                         │  Auth • RBAC • Tenancy       │
                         │  Domain modules • WS gateway │
                         └───┬───────────┬───────────┬──┘
                             │           │           │
                   ┌─────────▼──┐  ┌─────▼─────┐  ┌──▼─────────┐
                   │ PostgreSQL │  │   Redis   │  │  BullMQ    │
                   │  (Prisma)  │  │ presence/ │  │ background │
                   │  ledger    │  │  cache/ws │  │  workers   │
                   └────────────┘  └───────────┘  └────────────┘
                             ▲
                             │ WSS (signed commands, heartbeat)
                   ┌─────────┴──────────┐
                   │  Agent (C#/.NET)   │  one per workstation
                   │  Windows service   │
                   └────────────────────┘
```

## 2. Components

### 2.1 Frontend — `apps/web`
- **Next.js (App Router)** + **TypeScript strict**, deployed as PWA for managers/staff.
- **Tailwind CSS + shadcn/ui**, full **RTL** with a logical-properties design system.
- **TanStack Query** for server state, **TanStack Table** for data grids, **React Hook Form + Zod** for forms, **Recharts** for analytics.
- Three surfaces share the component library:
  1. **Admin/Manager console** — dashboards, management screens, reports.
  2. **Cashier POS** — fast keyboard/touch flows for sales & sessions.
  3. **Kiosk** — locked full-screen self-service for end customers.

### 2.2 Backend — `apps/api`
- **NestJS** modular monolith. Chosen over pure Server Actions because the domain
  needs long-lived WebSocket connections (agents + dashboards), background queues,
  and a documented REST surface for the Agent and 3rd-party adapters.
- **Prisma ORM** over **PostgreSQL**.
- **Redis** for real-time presence, rate-limit counters, pub/sub fan-out across API
  instances, and caching.
- **Socket.IO gateway** for browser dashboards and Agent command channels.
- **BullMQ** workers for: billing finalization, notifications, scheduled shutdown/
  restart, report generation, recurring subscription charges, exports.
- **OpenAPI/Swagger** generated from decorators at `/api/docs`.

### 2.3 Shared — `packages/shared`
Framework-agnostic **TypeScript types, Zod schemas, RBAC permission catalog, and
WebSocket event contracts** consumed by both API and web (and mirrored by the Agent).

### 2.4 Database — `packages/database`
Single source of truth for the **Prisma schema**, migrations and seed data.

### 2.5 Agent — `agent/`
Windows service in **C#/.NET**. Registers with an installation token, keeps a
heartbeat, receives **only allow-listed commands** over an encrypted WebSocket, and
caches state for offline resilience. See [`agent-protocol.md`](./agent-protocol.md).

## 3. Cross-cutting concerns

| Concern | Approach |
|---|---|
| **Multi-tenancy** | Every tenant-scoped row carries `tenantId`. A request-scoped `TenantContext` is derived from the authenticated principal; a Prisma middleware/extension enforces `tenantId` on reads/writes. Branch scoping layered on top. |
| **AuthN** | Argon2id password hashing, short-lived Access JWT + rotating Refresh token (httpOnly cookie), optional TOTP 2FA, optional Google OAuth. |
| **AuthZ** | RBAC with a fixed permission catalog (`packages/shared`). Guards check permissions **server-side on every route**; the client never decides access. See [`permissions-matrix.md`](./permissions-matrix.md). |
| **Money** | Stored as integer minor units (agorot). Balances never mutated directly — only via append-only ledger transactions inside DB transactions. |
| **Pricing** | Pluggable pricing engine; every transaction stores a **price snapshot** so later price changes never rewrite history. |
| **Auditing** | Append-only `AuditLog`; no UI edit/delete path. |
| **Real-time** | Redis pub/sub bridges Socket.IO across instances; every emit is scoped to `tenant:branch` rooms. |
| **Idempotency** | Payments and sensitive agent commands require an `Idempotency-Key`; results are de-duplicated. |
| **Errors** | Uniform error envelope `{ error: { code, message, details, traceId } }`. |

## 4. Request lifecycle (example: open a session)
1. Cashier submits *open session* (customer, computer, billing source).
2. API validates input (Zod/DTO), checks RBAC + tenant/branch scope.
3. Pricing engine computes an estimate and captures a price snapshot.
4. A DB transaction creates the `UsageSession`, reserves balance if prepaid.
5. A signed `START_SESSION` command is enqueued for the target Agent.
6. On Agent ack, session goes `ACTIVE`; `session.started` is emitted to the branch room.
7. Dashboards and the floor plan update in real time.

## 5. Deployment topology
- **Local dev:** `docker compose up` (Postgres + Redis) + `pnpm dev` (api + web).
- **Production:** containerized API and web behind a reverse proxy (TLS), managed
  Postgres + Redis, BullMQ workers as separate replicas, object storage for
  attachments/exports. CI/CD builds images, runs migrations, and executes the test
  matrix before promotion. See [`development-roadmap.md`](./development-roadmap.md).

## 6. Technology decisions (rationale)

| Decision | Why |
|---|---|
| **Monorepo (pnpm + Turborepo)** | Share types/validation between web, api, agent contracts; single CI. |
| **NestJS over Next API routes** | First-class DI, guards, WS gateways, queues; cleaner boundaries for a large domain. |
| **Prisma** | Type-safe queries, migrations, and a schema that doubles as documentation. |
| **Integer money + ledger** | Eliminates float rounding bugs; guarantees auditable, reconstructable balances. |
| **Price snapshots** | Financial correctness — historical invoices must never change. |
| **Allow-listed agent commands** | Security — no arbitrary shell execution from the console. |
| **Redis + Socket.IO** | Horizontal scale of real-time presence without sticky-only limits. |
