# Computer Room Manager — Workstation Agent

A Windows service (C#/.NET) installed on each managed workstation. It reports health
via heartbeat and executes **only allow-listed commands** received over an encrypted
WebSocket. It never runs free-form shell from the console.

See the full protocol in [`../docs/agent-protocol.md`](../docs/agent-protocol.md).

## Responsibilities
- **Register** with a single-use, time-boxed installation token → receive an agent
  credential + WebSocket URL.
- **Heartbeat** every ~15s with CPU/RAM/disk/logged-in-user/version metrics.
- **Execute allow-listed commands** (lock, restart, show message, start/end session,
  sync settings, screenshot-with-notice, collect logs, scheduled maintenance, …),
  validating each command's signature + TTL and de-duplicating by `commandId`.
- **Offline resilience**: persist the active session to disk, reconnect with backoff,
  replay buffered results, and let the server reconcile billing.
- **Signed auto-update**: verify the update package signature before applying.

## Security invariants
- Encrypted transport (WSS); commands are authenticated and signed.
- Reject any action outside the allow-list (`AGENT_ACTIONS` in `@crm/shared`).
- Screenshots require explicit permission and display a visible on-screen notice.
- No arbitrary command execution — ever.

## Planned layout (Stage 3+)
```
agent/
  src/
    CrmAgent.Service/        Windows service host + lifecycle
    CrmAgent.Core/           heartbeat, command dispatcher, allow-list, session cache
    CrmAgent.Transport/      WSS client, retry/backoff, signature verification
    CrmAgent.Updater/        signed auto-update
  installer/                 per-station installer (embeds org/branch/computer + token)
```

> This directory currently documents the protocol and contract. The .NET
> implementation is scheduled for Stage 3 of the roadmap; the server-side agent
> registration, heartbeat and command endpoints are defined in `docs/api-spec.md`
> and the shared allow-list lives in `packages/shared/src/agent/commands.ts`.
