# API Specification — Computer Room Manager

REST under `/api/v1`, documented live via Swagger at `/api/docs`. All responses use a
uniform envelope; all list endpoints support pagination, sorting, filtering, search.

## 1. Conventions
- **Auth:** `Authorization: Bearer <accessToken>`; refresh via httpOnly cookie.
- **Tenant/branch scope** derived from the token; cross-scope access → `403`.
- **Errors:** `{ "error": { "code": "STRING_CODE", "message": "...", "details": [...], "traceId": "..." } }`.
- **Pagination:** `?page=1&pageSize=25` → `{ data: [...], meta: { page, pageSize, total } }`.
- **Sorting:** `?sort=field:asc,other:desc`. **Filtering:** `?filter[status]=ACTIVE`.
  **Search:** `?q=free-text`.
- **Idempotency:** `Idempotency-Key: <uuid>` required on payments and sensitive agent
  commands.
- **Versioning:** path-based (`/api/v1`). **Webhooks** are HMAC-signed.

## 2. Endpoint groups

### Auth `/auth`
`POST /login` · `POST /refresh` · `POST /logout` · `POST /2fa/verify` ·
`POST /password/forgot` · `POST /password/reset` · `GET /me` ·
`POST /oauth/google` · `POST /kiosk/otp/request` · `POST /kiosk/otp/verify`

### Organizations & settings `/organizations` `/settings`
`GET/PATCH /organizations/:id` · `GET/PATCH /settings/org` ·
`GET/PATCH /settings/security` · `GET /settings/system`

### Branches `/branches`
`GET` · `POST` · `GET/:id` · `PATCH/:id` · `DELETE/:id` · `POST/:id/duplicate`

### Rooms & floor plans `/rooms` `/floorplans`
`GET/POST/PATCH/DELETE /rooms` · `GET/PUT /floorplans/:roomId`

### Computers `/computers`
`GET` · `POST` · `GET/:id` · `PATCH/:id` · `DELETE/:id` ·
`POST/:id/command` (allow-listed action) · `POST/bulk/command` ·
`GET/:id/heartbeats` · `GET/:id/logs`

### Computer groups `/computer-groups`
`GET/POST/PATCH/DELETE` — pricing ratio, cleanup & policy config.

### Agent `/agent`
`POST /register` (installation token) · `POST /heartbeat` ·
`GET /commands` (poll fallback) · `POST /commands/:id/result` ·
`GET /update/manifest`

### Customers `/customers` & groups `/customer-groups`
`GET` (search by name/phone/email/number/barcode/QR/RFID) · `POST` · `GET/:id` ·
`PATCH/:id` · `POST/:id/block` · `POST/:id/merge` · `DELETE/:id` ·
`GET/:id/balances` · `GET/:id/sessions` · `GET/:id/prints` · `GET/:id/payments` ·
`GET/:id/audit` · CRUD `/customer-groups`

### Balances `/customers/:id/balance`
`POST /load` · `POST /transfer` · `POST /adjust` (permission-gated) ·
`GET /transactions` (ledger)

### Packages & pricing `/packages` `/pricing` `/coupons`
CRUD `/packages`, `/packages/:id/prices` · `POST /customers/:id/packages` (assign) ·
`GET/PUT /pricing/rules` · CRUD `/coupons` · `POST /coupons/:code/redeem`

### Sessions `/sessions`
`GET` (active/history) · `POST /open` · `POST/:id/close` · `POST/:id/add-time` ·
`POST/:id/pause` · `POST/:id/resume` · `POST/:id/transfer` ·
`POST/:id/change-billing` · `GET/:id/events`

### Reservations & waiting list `/reservations` `/waiting-list`
CRUD reservations · `POST/:id/confirm` · `POST/:id/cancel` ·
`GET/POST/DELETE /waiting-list`

### Print `/print-jobs` `/printers`
`GET` · `POST` (ingest from agent) · `POST/:id/approve` · `POST/:id/cancel` ·
CRUD `/printers` · `GET/PUT /print-jobs/pricing`

### POS & finance `/sales` `/payments` `/refunds` `/cash`
`POST /sales` · `GET /sales` · `GET /sales/:id` ·
`POST /payments` (idempotent) · `POST /refunds` (permission + reason) ·
`POST /sales/:id/void` (reversing document) ·
`POST /cash/shifts/open` · `POST /cash/shifts/:id/close` ·
`POST /cash/movements` · `GET /invoices` · `POST /invoices/:id/send`

### Employees, roles `/employees` `/roles`
CRUD `/employees` · `GET/POST/PATCH /roles` · `GET /permissions` (catalog) ·
`POST /employees/:id/roles`

### Reports `/reports`
`GET /reports/revenue` · `/usage` · `/print` · `/system` — with period presets
(today, yesterday, week, month, quarter, year, custom range), compare, and
`?export=xlsx|csv|pdf`. `POST /reports/schedule`.

### Maintenance `/maintenance`
CRUD `/maintenance/tickets` · `/maintenance/tasks` · `/equipment`

### Notifications `/notifications` `/templates`
`GET /notifications` · `POST /notifications/send` · CRUD `/templates`

### Consents & documents `/consents` `/documents`
CRUD consent documents · `POST /customers/:id/consent`

### Audit `/audit`
`GET /audit` (filter by actor/entity/action/date) — **read-only**.

### Data `/imports` `/exports`
`POST /imports` · `GET /imports/:id` · `POST /exports` · `GET /exports/:id`

## 3. WebSocket (Socket.IO namespace `/rt`)
Client joins authorized rooms `tenant:{id}:branch:{id}`. Server emits:
`computer.connected` · `computer.disconnected` · `computer.status.changed` ·
`computer.metrics.updated` · `session.started` · `session.updated` ·
`session.warning` · `session.ended` · `print.job.created` · `print.job.approved` ·
`print.job.completed` · `print.job.failed` · `payment.completed` · `payment.failed` ·
`maintenance.created` · `alert.created` · `agent.command.sent` ·
`agent.command.completed` · `dashboard.metrics.updated`.
Every event is tenant+branch scoped; unauthorized joins are rejected.

## 4. Standard error codes
`AUTH_INVALID_CREDENTIALS`, `AUTH_2FA_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION_FAILED`, `TENANT_SCOPE_VIOLATION`, `INSUFFICIENT_BALANCE`,
`IDEMPOTENCY_CONFLICT`, `SESSION_ALREADY_ACTIVE`, `RATE_LIMITED`, `INTERNAL`.
