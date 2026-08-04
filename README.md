# Computer Room Manager

מערכת SaaS מקורית לניהול חדרי מחשבים ציבוריים, עמדות אינטרנט, חדרי לימוד, עמדות
שירות עצמי ומרכזי הדפסה. רב־סניפית, רב־שכירים (multi-tenant), עברית ו־RTL.

> An original SaaS for managing public computer rooms, internet stations, study
> rooms, self-service kiosks and print centers. Multi-branch, multi-tenant,
> Hebrew/RTL-first.

## מבנה המונו־רפו / Monorepo layout

```
apps/
  api/        NestJS backend — REST + OpenAPI, WebSocket, auth, RBAC, tenancy
  web/        Next.js frontend — RTL Hebrew admin/cashier/kiosk (PWA)
packages/
  database/   Prisma schema (all entities), migrations, seed
  shared/     Shared types, Zod schemas, RBAC catalog, WS + agent contracts
agent/        Windows Agent (C#/.NET) — protocol & skeleton
docs/         Architecture, DB design, permissions, API, agent protocol, security
```

## החלטות מפתח / Key design decisions
- **כסף כמספר שלם** (אגורות); כל שינוי יתרה דרך ledger בתוך transaction.
- **בידוד רב־שכירים** מלא ב-`tenantId`; RBAC נאכף **בצד שרת** בכל route.
- **Argon2id** לסיסמאות; Access + Refresh tokens עם רוטציה וזיהוי שימוש חוזר.
- **snapshot מחיר** בכל עסקה — שינוי מחיר עתידי לא משנה היסטוריה.
- **Agent** מבצע רק פקודות מרשימה מאושרת; אין הרצת shell חופשי מהלוח.

מסמכי אפיון מלאים תחת [`docs/`](./docs).

## דרישות מוקדמות / Prerequisites
- Node.js ≥ 20, **pnpm** 9
- Docker (ל-PostgreSQL ו-Redis) — או Postgres/Redis מקומיים

## התקנה מהירה / Quick start

```bash
# 1. משתני סביבה
cp .env.example .env            # ערוך סודות לפני production

# 2. תלויות
pnpm install

# 3. מסד נתונים (PostgreSQL + Redis)
pnpm docker:up

# 4. סכימה + נתוני דמו
pnpm db:generate
pnpm db:migrate                 # יוצר migration ראשוני
pnpm db:seed                    # tenant, roles, סניף, מחשבים, לקוח דמו

# 5. הרצה (api + web)
pnpm dev
```

- API: `http://localhost:4000`  ·  Swagger: `http://localhost:4000/api/docs`
- Web: `http://localhost:3000`
- כניסת דמו: `owner@demo.crm` / `Passw0rd!` · קופה: `cashier@demo.crm` / `Passw0rd!`

## סקריפטים / Scripts
| פקודה | תיאור |
|---|---|
| `pnpm dev` | הרצת כל האפליקציות במקביל (Turborepo) |
| `pnpm build` | בנייה |
| `pnpm lint` | בדיקת lint |
| `pnpm typecheck` | בדיקת טיפוסים |
| `pnpm test` | בדיקות |
| `pnpm db:migrate` | Prisma migrate (dev) |
| `pnpm db:seed` | נתוני seed |

## סטטוס / Status
ראו [`docs/development-roadmap.md`](./docs/development-roadmap.md).
- **שלב 1 (אפיון)** ✅ · **שלב 2 (תשתית)** ✅.
- **שלב 3 (MVP)** 🚧 — הושלמו: לקוחות (חיפוש + טעינת יתרה), קבוצות מחשבים, מחשבים
  (CRUD + פקודות מרחוק מרשימה מאושרת), **יתרות עם ledger טרנזקציוני**,
  **sessions עם חיוב לפי יחס וקטעים** (כולל העברה בין מחשבים), Agent
  (register/heartbeat/פקודות), מדדי לוח בקרה חיים, ויומן פעילות. מסכי web:
  מחשבים, לקוחות, שימושים, לוח בקרה.
- נותר לשלב 3: מכירת חבילות, קופה (POS), דוחות, עורך Floor Plan, אימות 2FA.

## פריסה / Deployment
- **Dev:** `pnpm docker:up` (Postgres+Redis) + `pnpm dev`.
- **Production:** `docker compose -f docker-compose.prod.yml up --build` — בונה image
  ל-API ול-web, מריץ `prisma migrate deploy` באתחול. משתני סביבה דרך `.env`/secret
  manager. גיבוי מסד: `DATABASE_URL=… ./scripts/backup.sh`.
- **Agent (.NET 8):** `agent/src/CrmAgent` — `dotnet build` ואז התקנה כשירות Windows
  (`sc.exe create CrmAgent …`). מבצע register → heartbeat → פקודות מרשימה מאושרת.
- **E2E:** הרם את הסטאק + `pnpm db:seed`, ואז `pnpm e2e` (Playwright).

## סליקת אשראי — נדרים פלוס / Nedarim Plus
המערכת מחוברת ל**נדרים פלוס** בשיטת ה-iframe המאובטח (סליקה ישירה עם מספר כרטיס
דרך API אסורה בחוק בישראל):
1. הזן ב-`.env`: `NEDARIM_MOSAD_ID`, `NEDARIM_API_VALID`, `NEDARIM_API_PASSWORD`
   (לזיכויים), ו-`PUBLIC_BASE_URL` (כתובת ציבורית שנדרים יכול להגיע אליה).
2. בקש משירות הלקוחות של נדרים לרשום את כתובת ה-CallBack:
   `<PUBLIC_BASE_URL>/api/v1/payments/nedarim/callback` — לעסקאות רגילות ולהו"ק.
3. בקופה/קיוסק לחץ **"שלם באשראי (נדרים פלוס)"** — נפתח iframe מאובטח; הכרטיס מוקלד
   בתוכו, והאישור הסופי מגיע ל-CallBack בשרת (server-authoritative, עם הצלבת Param + סכום).
- זרימה: `POST /payments/nedarim/prepare` → iframe `FinishTransaction2` → CallBack →
  סגירת המכירה + זיכוי החבילה דרך ה-ledger. זיכוי: `POST /payments/nedarim/refund/:saleId`.
- תומך תשלום חד-פעמי (Ragil) והוראת קבע (HK), ללא תשלומים. `ThirdPartyReceipt=1`
  כי המערכת מפיקה קבלות בעצמה. **הערה:** ה-iframe לא עובד מ-localhost — לבדיקות מקומיות
  יש כפתור "אישור ידני".

## רישיון / License
Proprietary — כל הזכויות שמורות. נבנה מאפס ללא העתקת קוד/עיצוב ממערכת קיימת.
