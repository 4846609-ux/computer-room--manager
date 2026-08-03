# Security Model — Computer Room Manager

## 1. Principles
- **Server is the source of truth for authorization.** The client UI hides actions for
  UX only; every route re-checks permission + tenant/branch scope.
- **Tenant isolation is absolute.** No query returns rows from another `tenantId`.
- **Least privilege.** Roles grant only the permissions listed in the matrix.
- **Financial integrity over convenience.** No destructive edits of money records.
- **Defense in depth.** Validation, rate limiting, auditing, and encryption combine.

## 2. Authentication
- **Passwords:** Argon2id (memory/time/parallelism configurable via env). Never logged.
- **Tokens:**
  - *Access JWT* — short-lived (≈15m), sent as `Authorization: Bearer`.
  - *Refresh token* — rotating, opaque, stored hashed server-side, delivered as an
    `httpOnly`, `Secure`, `SameSite=Strict` cookie. Rotation detects reuse and revokes
    the session family.
- **2FA:** Optional TOTP per organization policy; enforced at login for flagged roles.
- **OAuth:** Optional Google sign-in mapped to an existing employee/customer identity.
- **Kiosk/customer:** Phone + one-time code (OTP) or QR, isolated from staff auth.

## 3. Authorization (RBAC)
- Fixed **permission catalog** (`packages/shared/src/rbac`). Roles are sets of
  permissions; `UserRole` binds an employee to a role, optionally scoped to branches.
- A `PermissionsGuard` reads required permissions from route metadata and validates
  them against the principal's effective permissions **and** branch scope.
- Sensitive operations (refunds above threshold, price change during active session,
  voiding) require an additional **manager PIN** step, recorded in the audit log.

## 4. Multi-tenancy enforcement
- `tenantId` on every tenant-scoped table (see schema).
- Request-scoped `TenantContext` derived from the JWT claims.
- A Prisma extension injects `tenantId` into `where` clauses and rejects writes whose
  `tenantId` mismatches the context — a coding mistake cannot leak cross-tenant data.
- WebSocket rooms are namespaced `tenant:{id}:branch:{id}`; joins are authorized.

## 5. Input validation & API hardening
- All DTOs validated with Zod / class-validator; unknown fields stripped.
- **Rate limiting** (Redis token bucket) on auth, OTP, agent registration, payments.
- **CSRF**: cookie-based flows use the double-submit token pattern; Bearer API calls
  are CSRF-exempt by design.
- **CORS** locked to configured origins.
- Standard security headers (HSTS, X-Content-Type-Options, frame-ancestors, etc.).
- **Idempotency keys** for payments and sensitive agent commands.

## 6. Agent security
- Registration uses a **single-use, time-boxed installation token** (HMAC-signed,
  bound to tenant+branch+computer).
- Command channel is authenticated and encrypted (WSS + per-agent key).
- **Only allow-listed commands** are accepted; the server never sends free-form shell.
  Each command has an id, TTL, and signature; the Agent rejects expired/invalid ones.
- Auto-update packages are **digitally signed**; the Agent verifies before applying.
- Screenshots require an explicit permission and show a clear on-screen notice.

## 7. Sensitive data & privacy
- **No full card data** is stored — only tokens/last4 from a PSP adapter.
- Print jobs store metadata only; document contents are never persisted, file names
  can be masked, and print-queue metadata auto-expires.
- Field-level encryption for designated sensitive columns (e.g., national id).
- Personal customer storage is per-customer isolated; cross-customer access is denied.
- Data-retention policies drive automatic purging (logs, print metadata, customers).

## 8. Auditing
- Append-only `AuditLog`: actor, tenant, branch, IP, device, action, entity, entity id,
  previous value, new value, reason, success/failure, timestamp.
- Logged events: logins & failures, customer/pricing/permission/balance changes, sales,
  refunds, voids, remote agent actions, report downloads, sensitive-data views,
  settings changes, deletions, import/export.
- No edit/delete path is exposed in the UI or API.

## 9. Threat scenarios addressed (see tests)
Cross-tenant read attempt, double-charge race (idempotency), unauthorized refund,
price change mid-session (snapshot protects history), concurrent duplicate sessions,
agent disconnect mid-session recovery, brute-force login (rate limit + lockout + audit).

## 10. Secrets & configuration
- Secrets only via environment/secret manager; never committed. `.env.example` lists
  every variable with safe placeholders.
- Separate signing secrets for access, refresh, and agent channels.
