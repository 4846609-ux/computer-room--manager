import { AGENT_ACTIONS, ALL_AGENT_ACTIONS, DISRUPTIVE_ACTIONS, isAgentAction } from '@crm/shared';
import { tenantBranchRoom } from '@crm/shared';

/** Agent allow-list — only approved actions may ever be dispatched. */
describe('Agent command allow-list', () => {
  it('accepts every approved action', () => {
    for (const action of ALL_AGENT_ACTIONS) {
      expect(isAgentAction(action)).toBe(true);
    }
  });

  it('rejects anything outside the allow-list (no free-form shell)', () => {
    expect(isAgentAction('rm -rf /')).toBe(false);
    expect(isAgentAction('EXEC')).toBe(false);
    expect(isAgentAction('shutdown; drop table')).toBe(false);
  });

  it('marks the disruptive actions that need a busy-station guard', () => {
    expect(DISRUPTIVE_ACTIONS).toContain(AGENT_ACTIONS.SHUTDOWN);
    expect(DISRUPTIVE_ACTIONS).toContain(AGENT_ACTIONS.RESTART);
    expect(DISRUPTIVE_ACTIONS).toContain(AGENT_ACTIONS.LOGOFF_USER);
    expect(DISRUPTIVE_ACTIONS).not.toContain(AGENT_ACTIONS.SHOW_MESSAGE);
  });
});

/** WebSocket room scoping — mirrors mandatory scenario 8 (cross-branch isolation). */
describe('Realtime room scoping', () => {
  it('namespaces rooms by tenant and branch', () => {
    expect(tenantBranchRoom('t1', 'b1')).toBe('tenant:t1:branch:b1');
  });

  it('never collides across tenants or branches', () => {
    const a = tenantBranchRoom('t1', 'b1');
    const b = tenantBranchRoom('t2', 'b1'); // different tenant
    const c = tenantBranchRoom('t1', 'b2'); // different branch
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
});
