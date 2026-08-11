/**
 * Allow-listed Agent command actions. The server never sends free-form shell;
 * only these keys are accepted by the Agent. See docs/agent-protocol.md.
 */

export const AGENT_ACTIONS = {
  SHUTDOWN: 'SHUTDOWN',
  RESTART: 'RESTART',
  LOGOFF_USER: 'LOGOFF_USER',
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
  SHOW_MESSAGE: 'SHOW_MESSAGE',
  SCREENSHOT: 'SCREENSHOT',
  START_SESSION: 'START_SESSION',
  END_SESSION: 'END_SESSION',
  SYNC_SETTINGS: 'SYNC_SETTINGS',
  OPEN_APP: 'OPEN_APP',
  CLOSE_APP: 'CLOSE_APP',
  PING: 'PING',
  COLLECT_LOGS: 'COLLECT_LOGS',
  UPDATE_AGENT: 'UPDATE_AGENT',
  SCHEDULE_TASK: 'SCHEDULE_TASK',
  ENTER_MAINTENANCE: 'ENTER_MAINTENANCE',
  EXIT_MAINTENANCE: 'EXIT_MAINTENANCE',
  // Apply a usage access policy on the station: which capabilities (internet,
  // email, video) are allowed/blocked, and whether video is blocked locally,
  // online, or both. Payload shape = AccessPolicyPayload (see access-profile.ts).
  APPLY_ACCESS_POLICY: 'APPLY_ACCESS_POLICY',
} as const;

export type AgentAction = (typeof AGENT_ACTIONS)[keyof typeof AGENT_ACTIONS];

export const ALL_AGENT_ACTIONS: AgentAction[] = Object.values(AGENT_ACTIONS);

/** Actions that must never run immediately while a user is connected without force. */
export const DISRUPTIVE_ACTIONS: AgentAction[] = [
  AGENT_ACTIONS.SHUTDOWN,
  AGENT_ACTIONS.RESTART,
  AGENT_ACTIONS.LOGOFF_USER,
];

export function isAgentAction(value: string): value is AgentAction {
  return (ALL_AGENT_ACTIONS as string[]).includes(value);
}
