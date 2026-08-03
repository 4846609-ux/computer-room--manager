/**
 * RBAC permission catalog — the single source of truth for `resource.action`
 * permission keys. Mirrors docs/permissions-matrix.md. The API seeds these into
 * the Permission table and enforces them server-side on every route.
 */

export const PERMISSIONS = {
  // Branches
  BRANCH_READ: 'branch.read',
  BRANCH_CREATE: 'branch.create',
  BRANCH_UPDATE: 'branch.update',
  BRANCH_DELETE: 'branch.delete',

  // Rooms / floor plan
  ROOM_READ: 'room.read',
  ROOM_MANAGE: 'room.manage',
  FLOORPLAN_MANAGE: 'floorplan.manage',

  // Computers
  COMPUTER_READ: 'computer.read',
  COMPUTER_MANAGE: 'computer.manage',
  COMPUTER_REMOTE_CONTROL: 'computer.remote.control',
  COMPUTER_REMOTE_SCREENSHOT: 'computer.remote.screenshot',
  COMPUTER_GROUP_MANAGE: 'computer.group.manage',
  AGENT_INSTALL: 'agent.install',
  AGENT_UPDATE: 'agent.update',

  // Customers
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',
  CUSTOMER_BLOCK: 'customer.block',
  CUSTOMER_MERGE: 'customer.merge',
  CUSTOMER_DELETE: 'customer.delete',
  CUSTOMER_GROUP_MANAGE: 'customer.group.manage',

  // Balances
  BALANCE_READ: 'balance.read',
  BALANCE_LOAD: 'balance.load',
  BALANCE_TRANSFER: 'balance.transfer',
  BALANCE_ADJUST: 'balance.adjust',

  // Packages / pricing
  PACKAGE_READ: 'package.read',
  PACKAGE_MANAGE: 'package.manage',
  PRICING_READ: 'pricing.read',
  PRICING_MANAGE: 'pricing.manage',
  COUPON_MANAGE: 'coupon.manage',

  // Sessions
  SESSION_READ: 'session.read',
  SESSION_OPEN: 'session.open',
  SESSION_CLOSE: 'session.close',
  SESSION_MODIFY: 'session.modify',
  SESSION_TRANSFER: 'session.transfer',

  // Reservations
  RESERVATION_READ: 'reservation.read',
  RESERVATION_MANAGE: 'reservation.manage',

  // Print
  PRINT_READ: 'print.read',
  PRINT_APPROVE: 'print.approve',
  PRINT_MANAGE: 'print.manage',
  PRINTER_MANAGE: 'printer.manage',

  // POS / cash
  SALE_CREATE: 'sale.create',
  SALE_READ: 'sale.read',
  PAYMENT_TAKE: 'payment.take',
  REFUND_CREATE: 'refund.create',
  VOID_CREATE: 'void.create',
  CASH_SHIFT_OPEN: 'cash.shift.open',
  CASH_SHIFT_CLOSE: 'cash.shift.close',
  CASH_MOVEMENT_CREATE: 'cash.movement.create',
  INVOICE_ISSUE: 'invoice.issue',

  // Maintenance
  MAINTENANCE_READ: 'maintenance.read',
  MAINTENANCE_MANAGE: 'maintenance.manage',
  EQUIPMENT_MANAGE: 'equipment.manage',

  // Employees / roles
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_MANAGE: 'employee.manage',
  ROLE_MANAGE: 'role.manage',
  PERMISSION_MANAGE: 'permission.manage',

  // Reports
  REPORT_REVENUE: 'report.revenue',
  REPORT_USAGE: 'report.usage',
  REPORT_PRINT: 'report.print',
  REPORT_SYSTEM: 'report.system',
  REPORT_EXPORT: 'report.export',

  // Notifications
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_SEND: 'notification.send',
  TEMPLATE_MANAGE: 'template.manage',

  // Consents / documents
  CONSENT_MANAGE: 'consent.manage',
  DOCUMENT_MANAGE: 'document.manage',

  // Audit
  AUDIT_READ: 'audit.read',

  // Settings
  SETTINGS_ORG: 'settings.org',
  SETTINGS_SECURITY: 'settings.security',
  SETTINGS_BILLING: 'settings.billing',

  // Data
  DATA_IMPORT: 'data.import',
  DATA_EXPORT: 'data.export',
  DATA_BACKUP: 'data.backup',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);
