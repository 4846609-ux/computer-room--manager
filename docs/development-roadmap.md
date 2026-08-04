# Development Roadmap — Computer Room Manager

Staged delivery. Each stage ends with lint + typecheck + tests green.

## Stage 1 — Specification & architecture ✅ (this commit)
- `architecture.md`, `database-design.md`, `permissions-matrix.md`, `api-spec.md`,
  `agent-protocol.md`, `security-model.md`, `development-roadmap.md`.

## Stage 2 — Project foundation ✅/🚧 (this commit)
- Monorepo (pnpm + Turborepo), TypeScript strict, Prettier, Docker Compose.
- `packages/shared`: types, Zod schemas, RBAC permission catalog, WS event contracts.
- `packages/database`: full Prisma schema (all entities) + seed data.
- `apps/api`: NestJS bootstrap, config, Prisma module, **multi-tenancy** context,
  **RBAC** guards, **auth** (Argon2 + access/refresh), audit interceptor, Swagger.
- `apps/web`: Next.js RTL/Hebrew shell, design system tokens, login, dashboard scaffold.

## Stage 3 — MVP 🚧 (in progress)
Done in this iteration:
1. ✅ Login · 2. ✅ Branches · 3. ✅ Computers (CRUD + remote allow-listed commands) ·
4. ✅ Computer groups (pricing config) · 5. ✅ Customers (CRUD, search, load balance) ·
7. ✅ Balances (append-only ledger, transactional, overdraft-guarded) ·
8. ✅ Sessions (open/close/add-time/transfer, per-segment ratio billing) ·
9. ✅ Live dashboard metrics endpoint + wired UI · 10. ✅ Agent
(register/heartbeat/command-result) · 13. ✅ Audit log (read API + writes on every
mutation). Web pages: computers, customers, sessions, dashboard.

Also done: 6. ✅ Packages purchase flow (POS sale → payment → package applied to
balance via ledger) + catalog (packages/products) · 11. ✅ POS (cash shifts with
variance, sales, idempotent payments, refunds as reversing documents) ·
12. ✅ Basic reports (revenue by method, usage summary, period presets). Web pages:
POS and reports.

Also done: ✅ interactive Floor Plan — rooms API + per-room floor view with live
status/occupancy and a drag-to-position editor that persists the layout.
✅ 2FA — dependency-free TOTP (RFC 6238) verified at login, setup/enable/disable
endpoints + settings UI (RFC test vectors covered). ✅ Fiscal documents —
per-tenant numbered invoice issuance + printable HTML receipt (browser
print-to-PDF), issued from POS.

**Stage 3 (MVP) is functionally complete.** Optional polish deferred to later:
server-rendered PDF binaries, richer floor-plan zones.

## Stage 4 — Extensions 🚧 (in progress)
Done: ✅ Print jobs & pricing (rule-based per-page pricing, approve→charge from
print quota or money via ledger) · ✅ Reservations (create/confirm/check-in/cancel/
no-show, confirmation codes) · ✅ Maintenance/tickets (numbered tickets, category/
priority, status workflow). Web pages: printing, reservations, maintenance.

Also done: ✅ self-service **kiosk** (phone+OTP login, buy package, load balance,
open a free station — reusing the same sale/session services & guards) ·
✅ personal storage (quota management) · ✅ recurring **subscriptions** (create +
process-due charging via ledger, PAST_DUE on insufficient funds) · ✅ notifications
center (in-app + manager alerts, unread badge; external channels via adapters) ·
✅ import/export (customers/sales CSV) · ✅ waiting list. Web: kiosk, notifications
pages; CSV export button.

**Stage 4 is functionally complete.** Remaining polish: real SMS/email/WhatsApp
adapters, object-storage file I/O for personal storage, BullMQ scheduling of the
subscription/notification workers.

## Stage 5 — Production hardening 🚧 (in progress)
Done: ✅ expanded test suite (pricing, ledger invariant, TOTP RFC vectors, RBAC
role mapping incl. scenario 5, agent allow-list, WS room isolation incl. scenario 8
— 25 unit tests) · ✅ Playwright E2E config + auth smoke spec (`pnpm e2e` against a
live stack) · ✅ provider **adapters** (payments PSP + notifications) with safe
defaults, swappable per deployment · ✅ **Dockerfiles** (api + web standalone),
production docker-compose (migrate-on-boot), `.dockerignore` · ✅ DB **backup**
script with retention · ✅ **Agent** .NET 8 Worker-service skeleton implementing the
protocol (register → heartbeat → allow-listed command dispatch, backoff).

Also done: ✅ **BullMQ** worker module (hourly subscription-renewal sweep; disabled
unless ENABLE_WORKERS=true so dev boots without Redis) · ✅ object-**storage**
adapter (interface + no-op default, bound in AdaptersModule) · ✅ **employees**
module + page (create with role/PIN, RBAC-guarded) · ✅ organization **settings**
module + page (VAT/currency/timezone/retention) · ✅ **coupons** module + page,
integrated into the sale flow (percent/fixed discount, redemption recorded) ·
✅ more E2E specs (navigation across core screens).

Remaining (external integrations only): real vendor adapters (SMS/email/WhatsApp/
acquirer), real object-storage backend, full E2E run of all 10 scenarios in CI,
load/performance testing, monitoring/alerting wiring.

## Mandatory test scenarios (Stage 5 gate)
1. Buy 100 min, use on ratio-2 computer.
2. Move from standard to premium computer mid-session.
3. Agent disconnects mid-session (recovery).
4. Print without sufficient balance.
5. Cashier attempts refund without permission.
6. Manager changes price during an active session (snapshot protects it).
7. Two identical payment requests race (idempotency).
8. User from branch A tries to view branch B data.
9. User opens two concurrent sessions.
10. Computer restarts without clean session end.

## Definition of done (per stage)
- `pnpm lint && pnpm typecheck && pnpm test` pass.
- New endpoints appear in Swagger with DTO validation.
- Server-side permission + tenant checks on every new route.
- Financial operations wrapped in DB transactions with ledger entries.
- README/docs updated.
