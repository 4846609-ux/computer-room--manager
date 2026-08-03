# Permissions Matrix — Computer Room Manager

Roles are **sets of permissions**. The catalog below is the single source of truth and
is mirrored in code at `packages/shared/src/rbac/permissions.ts`. Every API route
declares the permission(s) it requires; the server enforces them.

## 1. Roles
| Key | Role | Scope |
|---|---|---|
| `OWNER` | בעלים | All branches, all data, billing & security settings |
| `SYS_ADMIN` | מנהל מערכת | Everything except owner/billing-of-subscription settings |
| `BRANCH_MANAGER` | מנהל סניף | Only assigned branch(es) |
| `CASHIER` | עובד קופה | POS actions in assigned branch |
| `TECHNICIAN` | טכנאי | Computer/maintenance ops; no financial data unless granted |
| `ACCOUNTANT` | רואה חשבון | Read-only financial reports/documents |
| `CUSTOMER` | לקוח קצה | Personal area only |

## 2. Permission catalog (grouped)
Format: `resource.action`.

**Branches:** `branch.read` `branch.create` `branch.update` `branch.delete`
**Rooms/FloorPlan:** `room.read` `room.manage` `floorplan.manage`
**Computers:** `computer.read` `computer.manage` `computer.remote.control`
`computer.remote.screenshot` `computer.group.manage` `agent.install` `agent.update`
**Customers:** `customer.read` `customer.create` `customer.update` `customer.block`
`customer.merge` `customer.delete` `customer.group.manage`
**Balances:** `balance.read` `balance.load` `balance.transfer` `balance.adjust`
**Packages/Pricing:** `package.read` `package.manage` `pricing.read` `pricing.manage`
`coupon.manage`
**Sessions:** `session.read` `session.open` `session.close` `session.modify`
`session.transfer`
**Reservations:** `reservation.read` `reservation.manage`
**Print:** `print.read` `print.approve` `print.manage` `printer.manage`
**POS/Cash:** `sale.create` `sale.read` `payment.take` `refund.create` `void.create`
`cash.shift.open` `cash.shift.close` `cash.movement.create` `invoice.issue`
**Maintenance:** `maintenance.read` `maintenance.manage` `equipment.manage`
**Employees/Roles:** `employee.read` `employee.manage` `role.manage` `permission.manage`
**Reports:** `report.revenue` `report.usage` `report.print` `report.system`
`report.export`
**Notifications:** `notification.read` `notification.send` `template.manage`
**Consents/Docs:** `consent.manage` `document.manage`
**Audit:** `audit.read`
**Settings:** `settings.org` `settings.security` `settings.billing`
**Data:** `data.import` `data.export` `data.backup`

## 3. Role → permission mapping (summary)

| Permission group | OWNER | SYS_ADMIN | BRANCH_MANAGER | CASHIER | TECHNICIAN | ACCOUNTANT |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Branches (create/delete) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Branches (read) | ✅ | ✅ | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (read) |
| Computers manage/remote | ✅ | ✅ | ✅ (own) | ❌ | ✅ (own) | ❌ |
| Remote screenshot | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Customers create/update | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Customers merge/delete | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Balances load | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Balances adjust | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pricing/packages manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Coupons manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sessions open/close/modify | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Session transfer | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Print approve/manage | ✅ | ✅ | ✅ | ✅ (approve) | ❌ | ❌ |
| Sale/payment | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Refund/void | ✅ | ✅ | ✅ (≤ limit) | ❌ | ❌ | ❌ |
| Void/delete transaction | ❌* | ❌* | ❌* | ❌ | ❌ | ❌ |
| Cash shift open/close | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Maintenance manage | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Employees/roles manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Permissions manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reports (revenue) | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ✅ |
| Reports (usage/system) | ✅ | ✅ | ✅ (own) | ❌ | ✅ (system) | ✅ (usage) |
| Reports export | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Audit read | ✅ | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| Settings: org | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settings: security | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Settings: billing (subscription) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Data import/export/backup | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

`*` Money records are **never hard-deleted or edited**. "Void" creates a reversing
document; it is not the same as delete. No role can delete a financial transaction.

## 4. Scope rules
- **Branch scope:** `BRANCH_MANAGER`, `CASHIER`, `TECHNICIAN` see only branches bound
  to them via `UserRole.branchIds`. Cross-branch access returns 403.
- **Financial visibility:** `TECHNICIAN` sees no financial data unless explicitly
  granted `report.*`/`balance.read`.
- **Elevation:** Some actions require a live **manager PIN** even for permitted users
  (configurable thresholds). This is an extra factor, not a permission substitute.

## 5. Customer (end-user) capabilities
Not part of staff RBAC. A customer may only: view own balances/time/print quota, view
purchase history, buy packages, change password, see available computers, and (if
enabled) reserve a station. All scoped to their own `customerId`.
