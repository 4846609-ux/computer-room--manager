# Agent Protocol — Computer Room Manager

The Agent is a Windows service (C#/.NET) installed on each workstation. It never
executes free-form shell from the console; it only performs **allow-listed commands**.

## 1. Lifecycle
1. **Provision** — Admin creates a computer record and generates a single-use,
   time-boxed **installation token** (HMAC-signed, bound to tenant+branch+computer).
2. **Install** — A per-station installer embeds org/branch/computer ids + token.
3. **Register** — `POST /api/v1/agent/register` with the token → server returns a
   long-lived **agent credential** (id + secret) and the WebSocket URL. Token is burned.
4. **Connect** — Agent opens an authenticated WSS connection and subscribes to its
   command channel.
5. **Heartbeat** — Agent sends metrics every N seconds (default 15s).
6. **Commands** — Server pushes signed commands; Agent validates and executes, then
   reports a result.
7. **Auto-update** — Agent pulls signed update manifests; verifies signature; applies.

## 2. Transport & security
- WSS (TLS). Messages authenticated with the agent secret; sensitive commands carry an
  HMAC signature + `expiresAt` (TTL). Expired or invalid-signature commands are dropped.
- Reconnect with exponential backoff + jitter. A **local cache** buffers session state
  and pending results during outages and replays on reconnect.
- **Idempotency:** every command has a unique `commandId`; the Agent de-duplicates so a
  replayed command runs at most once.

## 3. Messages

### 3.1 Heartbeat (Agent → Server)
```jsonc
{
  "type": "heartbeat",
  "agentId": "uuid",
  "sentAt": "2026-08-03T10:00:00Z",
  "metrics": {
    "cpuPercent": 12.4,
    "ramPercent": 43.1,
    "diskFreeMb": 128000,
    "loggedInUser": "guest01",       // OS session, if any
    "localIp": "10.0.0.14",
    "agentVersion": "1.0.3",
    "antivirusOk": true,             // null if undetectable
    "uptimeSec": 38211
  },
  "activeSessionId": "uuid|null"
}
```

### 3.2 Command (Server → Agent)
```jsonc
{
  "type": "command",
  "commandId": "uuid",
  "action": "LOCK",                  // from the allow-list below
  "params": { "message": "..." },    // schema depends on action
  "issuedBy": "employeeId",
  "expiresAt": "2026-08-03T10:00:30Z",
  "signature": "base64-hmac"
}
```

### 3.3 Command result (Agent → Server)
```jsonc
{
  "type": "command_result",
  "commandId": "uuid",
  "status": "SUCCESS",               // SUCCESS | FAILED | REJECTED | EXPIRED
  "detail": "…",
  "completedAt": "2026-08-03T10:00:01Z"
}
```

## 4. Allow-listed commands
| Action | Params | Notes |
|---|---|---|
| `SHUTDOWN` | `{ afterSessionEnd?: bool }` | Refuses immediate if user connected unless `force`. |
| `RESTART` | `{ afterSessionEnd?: bool, force?: bool }` | |
| `LOGOFF_USER` | `{}` | Ends OS session. |
| `LOCK` / `UNLOCK` | `{}` | Locks/unlocks the workstation. |
| `SHOW_MESSAGE` | `{ title, body, timeoutSec? }` | On-screen notice to user. |
| `SCREENSHOT` | `{}` | Requires permission; shows a visible notice. |
| `START_SESSION` | `{ sessionId, customerLabel, minutesRemaining, cleanupPolicy }` | Applies group policy, maps personal storage. |
| `END_SESSION` | `{ sessionId, cleanup: bool }` | Runs cleanup, unmaps storage. |
| `SYNC_SETTINGS` | `{ groupPolicyId }` | Re-applies allowed apps/sites, language. |
| `OPEN_APP` / `CLOSE_APP` | `{ appKey }` | Only apps in the group allow-list. |
| `PING` | `{}` | Connectivity check. |
| `COLLECT_LOGS` | `{ sinceMinutes? }` | Uploads diagnostic logs. |
| `UPDATE_AGENT` | `{ version, manifestUrl }` | Verifies signature before applying. |
| `SCHEDULE_TASK` | `{ kind: 'shutdown'|'restart', at }` | Nightly maintenance windows. |
| `ENTER_MAINTENANCE` / `EXIT_MAINTENANCE` | `{}` | Blocks new sessions. |

Any action outside this list is rejected by the Agent regardless of payload.

## 5. Bulk operations (server-side rules)
- Never shutdown/restart a station with an active user immediately unless the manager
  explicitly chose **"execute now"**.
- Default to **"execute after session ends"** by queueing the command with a condition.
- Show a confirmation before destructive actions; log every action to the audit log.

## 6. Offline resilience
- Agent persists the current session (id, start time, remaining minutes) to disk.
- On reconnect it reports actual state; the server reconciles billing (e.g., cap at
  last known heartbeat if the station died), emitting `session.updated`/`session.ended`.

## 7. Related WebSocket events (Server → dashboards)
`agent.command.sent`, `agent.command.completed`, `computer.connected`,
`computer.disconnected`, `computer.status.changed`, `computer.metrics.updated`.
See [`api-spec.md`](./api-spec.md) §WebSocket.
