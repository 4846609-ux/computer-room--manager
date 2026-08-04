import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
} from '@crm/shared';

/** RBAC invariants — mirrors mandatory scenario 5 (cashier cannot refund). */
describe('RBAC role → permission mapping', () => {
  it('OWNER has every permission in the catalog', () => {
    expect(new Set(ROLE_PERMISSIONS[ROLE_KEYS.OWNER])).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('SYS_ADMIN has everything except subscription billing', () => {
    const perms = new Set(ROLE_PERMISSIONS[ROLE_KEYS.SYS_ADMIN]);
    expect(perms.has(PERMISSIONS.SETTINGS_BILLING)).toBe(false);
    expect(perms.has(PERMISSIONS.PRICING_MANAGE)).toBe(true);
  });

  it('CASHIER cannot refund, void, or change pricing (scenario 5)', () => {
    const perms = new Set(ROLE_PERMISSIONS[ROLE_KEYS.CASHIER]);
    expect(perms.has(PERMISSIONS.REFUND_CREATE)).toBe(false);
    expect(perms.has(PERMISSIONS.VOID_CREATE)).toBe(false);
    expect(perms.has(PERMISSIONS.PRICING_MANAGE)).toBe(false);
    // but can take payments and open sessions
    expect(perms.has(PERMISSIONS.PAYMENT_TAKE)).toBe(true);
    expect(perms.has(PERMISSIONS.SESSION_OPEN)).toBe(true);
  });

  it('TECHNICIAN sees no financial permissions by default', () => {
    const perms = new Set(ROLE_PERMISSIONS[ROLE_KEYS.TECHNICIAN]);
    expect(perms.has(PERMISSIONS.REPORT_REVENUE)).toBe(false);
    expect(perms.has(PERMISSIONS.BALANCE_READ)).toBe(false);
    expect(perms.has(PERMISSIONS.SALE_CREATE)).toBe(false);
    // but can manage computers & maintenance
    expect(perms.has(PERMISSIONS.COMPUTER_REMOTE_CONTROL)).toBe(true);
    expect(perms.has(PERMISSIONS.MAINTENANCE_MANAGE)).toBe(true);
  });

  it('ACCOUNTANT is read-only over finance (no create/refund)', () => {
    const perms = new Set(ROLE_PERMISSIONS[ROLE_KEYS.ACCOUNTANT]);
    expect(perms.has(PERMISSIONS.REPORT_REVENUE)).toBe(true);
    expect(perms.has(PERMISSIONS.SALE_READ)).toBe(true);
    expect(perms.has(PERMISSIONS.SALE_CREATE)).toBe(false);
    expect(perms.has(PERMISSIONS.REFUND_CREATE)).toBe(false);
  });

  it('every role grants only permissions that exist in the catalog', () => {
    const catalog = new Set<string>(ALL_PERMISSIONS);
    for (const key of Object.values(ROLE_KEYS)) {
      for (const perm of ROLE_PERMISSIONS[key]) {
        expect(catalog.has(perm)).toBe(true);
      }
    }
  });
});
