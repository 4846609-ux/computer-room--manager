/**
 * WebSocket event contracts (Socket.IO namespace `/rt`). Every event is scoped to
 * a tenant+branch room; see docs/api-spec.md §WebSocket.
 */

export const WS_EVENTS = {
  COMPUTER_CONNECTED: 'computer.connected',
  COMPUTER_DISCONNECTED: 'computer.disconnected',
  COMPUTER_STATUS_CHANGED: 'computer.status.changed',
  COMPUTER_METRICS_UPDATED: 'computer.metrics.updated',
  SESSION_STARTED: 'session.started',
  SESSION_UPDATED: 'session.updated',
  SESSION_WARNING: 'session.warning',
  SESSION_ENDED: 'session.ended',
  PRINT_JOB_CREATED: 'print.job.created',
  PRINT_JOB_APPROVED: 'print.job.approved',
  PRINT_JOB_COMPLETED: 'print.job.completed',
  PRINT_JOB_FAILED: 'print.job.failed',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  MAINTENANCE_CREATED: 'maintenance.created',
  ALERT_CREATED: 'alert.created',
  AGENT_COMMAND_SENT: 'agent.command.sent',
  AGENT_COMMAND_COMPLETED: 'agent.command.completed',
  DASHBOARD_METRICS_UPDATED: 'dashboard.metrics.updated',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface WsEnvelope<T = unknown> {
  event: WsEvent;
  tenantId: string;
  branchId: string | null;
  payload: T;
  emittedAt: string;
}

export function tenantBranchRoom(tenantId: string, branchId: string): string {
  return `tenant:${tenantId}:branch:${branchId}`;
}
