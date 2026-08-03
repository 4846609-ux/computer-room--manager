# Database Design — Computer Room Manager

PostgreSQL via Prisma. See the authoritative schema in
`packages/database/prisma/schema.prisma`.

## 1. Conventions
- **UUID** primary keys (`@id @default(uuid())`).
- **`tenantId`** on every tenant-scoped table; composite indexes lead with `tenantId`.
- Timestamps: `createdAt`, `updatedAt`; **soft delete** via nullable `deletedAt` where
  records must be retained (customers, computers, tickets, documents…).
- **Money is integer minor units** (agorot) in `Int`/`BigInt` columns named `*Minor`.
- **Foreign keys** everywhere; `onDelete` chosen per relation (mostly `Restrict` for
  financial data, `Cascade` only for owned children like session events).
- Enums for finite states (statuses, kinds, payment methods).
- Unique constraints scoped by tenant (e.g., `@@unique([tenantId, code])`).

## 2. Domain groupings

### Tenancy & settings
`Tenant`, `OrganizationSettings`, `SystemSetting`, `Branch`, `Room`, `FloorPlan`.

### Computers & agents
`ComputerGroup`, `Computer`, `ComputerAgent`, `AgentHeartbeat`, `AgentCommand`,
`AgentCommandResult`, `Printer`, `Equipment`.

### Customers & balances
`CustomerGroup`, `Customer`, `CustomerBalance`, `CustomerBalanceTransaction` (the
**ledger**), `CustomerStorage`, `CustomerConsent`.

### Products & pricing
`Product`, `Package`, `PackagePrice`, `CustomerPackage`, `Subscription`, `Coupon`,
`CouponRedemption`, `PrintPriceRule`.

### Usage
`UsageSession`, `UsageSessionEvent`, `Reservation`, `WaitingListEntry`, `PrintJob`.

### POS & finance
`Sale`, `SaleItem`, `Payment`, `Refund`, `CashRegister`, `CashShift`, `CashMovement`,
`Invoice`.

### People & access
`Employee`, `Role`, `Permission`, `UserRole`.

### Ops & platform
`MaintenanceTicket`, `MaintenanceTask`, `Notification`, `MessageTemplate`,
`ConsentDocument`, `AuditLog`, `FileAttachment`, `ApiKey`, `Webhook`, `ImportJob`,
`ExportJob`.

## 3. The money ledger (critical)
- `CustomerBalance` holds cached balances: `moneyMinor`, `timeSecondsRemaining`,
  `printBwRemaining`, `printColorRemaining`, `debtMinor`.
- **No code updates a balance directly.** Every change inserts a
  `CustomerBalanceTransaction` (append-only) *inside the same DB transaction* that
  updates the cached balance. `kind` records the reason (LOAD, USAGE, PRINT, REFUND,
  ADJUST, TRANSFER, PACKAGE, EXPIRY…). `balanceAfter*` snapshots enable reconstruction.
- Invariant enforced in a Prisma transaction + service layer; covered by
  balance-ledger tests.

## 4. Price snapshots
- `SaleItem`, `UsageSession`, and `PrintJob` persist the **effective price** at
  transaction time (`unitPriceMinor`, `ratio`, `pricingSnapshot` JSON). Changing a
  `Package`/`PackagePrice`/`PrintPriceRule` later never alters historical rows.
- `PackagePrice` and pricing rules keep `validFrom`/`validTo` for history.

## 5. Sessions
- `UsageSession`: computer, customer, billing source, `ratio`, `startedAt`,
  `endedAt`, `secondsBilled`, `amountMinor`, `status`, plus counters for prints/add-ons.
- `UsageSessionEvent`: append-only timeline (STARTED, PAUSED, RESUMED, ADD_TIME,
  TRANSFER, WARNING, ENDED, RECOVERED) — supports offline recovery & audit.
- Guard: a customer cannot hold two concurrent active sessions (unique partial index
  on active status).

## 6. Multi-tenant isolation at the DB layer
- Every scoped query is filtered by `tenantId` via a Prisma extension.
- Cross-tenant foreign keys are impossible because relations are created within a
  tenant context; tests assert isolation (scenario 8).

## 7. Indexing highlights
- `Computer`: `@@index([tenantId, branchId, status])`, unique `[tenantId, systemId]`.
- `UsageSession`: `@@index([tenantId, branchId, status])`, `@@index([customerId])`.
- `CustomerBalanceTransaction`: `@@index([tenantId, customerId, createdAt])`.
- `AuditLog`: `@@index([tenantId, createdAt])`, `@@index([entity, entityId])`.
- `PrintJob`, `Sale`, `Payment`, `AgentHeartbeat`: time + branch indexes for reports.

## 8. Soft delete & retention
- `deletedAt` filtered out by default in the data layer.
- Retention jobs purge print metadata, logs, and (per policy) inactive customer PII.
- `AuditLog` is never deleted through the app; retention is an ops-level concern.
