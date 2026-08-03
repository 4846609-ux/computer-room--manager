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

## Stage 3 — MVP
1. Login (2FA optional) · 2. Branches · 3. Computers · 4. Computer groups ·
5. Customers · 6. Packages · 7. Balances (ledger) · 8. Sessions ·
9. Real-time dashboard + floor plan · 10. Basic Agent (register/heartbeat/commands) ·
11. Basic POS (shift, sale, payment, receipt) · 12. Basic reports · 13. Audit log.

## Stage 4 — Extensions
Print jobs & pricing · Reservations & waiting list · Maintenance/tickets ·
Self-service kiosk · Personal storage · Recurring subscription billing ·
Documents & invoices · Notifications (multi-channel) · Full floor-plan editor ·
Import/export.

## Stage 5 — Production hardening
Test matrix (unit, integration, API, permissions, pricing, ledger, session billing,
print billing, multi-tenant isolation, WS authz, agent reconnect, offline recovery,
Playwright E2E) · security review · performance · monitoring · backups · docs ·
install guide · migration scripts · CI/CD deployment.

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
