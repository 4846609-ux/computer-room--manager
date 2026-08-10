# מדריך פריסה פשוט — Computer Room Manager

המערכת בנויה משני חלקים:
- **המוח** (שרת + מסד נתונים) → רץ ב-**Render**.
- **המסכים** (האתר שרואים) → אפשר ב-**Netlify** (או ב-Render).

---

## חלק א׳ — השרת (Render)

> כבר יש לך שירות בשם `computer-room-manager-api` ב-Render. צריך לוודא 2 דברים:

### 1. מסד נתונים + Redis
ב-Render צור (אם עוד אין):
- **PostgreSQL** (New → Postgres). העתק את ה-Internal Connection String.
- **Key Value / Redis** (New → Key Value).

### 2. משתני סביבה על שירות ה-API
Render → השירות `computer-room-manager-api` → **Environment** → הוסף:

| שם | ערך |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | ה-Connection String של ה-Postgres |
| `REDIS_URL` | ה-Connection String של ה-Redis |
| `JWT_ACCESS_SECRET` | טקסט אקראי ארוך (למשל 40 תווים) |
| `JWT_REFRESH_SECRET` | טקסט אקראי ארוך אחר |
| `AGENT_SIGNING_SECRET` | טקסט אקראי ארוך אחר |
| `PUBLIC_BASE_URL` | `https://computer-room-manager-api.onrender.com` |
| `CORS_ORIGIN` | כתובת האתר שלך ב-Netlify (תמלא אחרי חלק ב׳) |
| `NEDARIM_MOSAD_ID` | מספר המוסד שלך (7 ספרות) |
| `NEDARIM_API_VALID` | "טקסט אימות" ממסך "מפתחות API" בנדרים |
| `NEDARIM_API_PASSWORD` | "סיסמת API" בנדרים (סוד — לזיכויים) |
| `NEDARIM_CALLBACK_MODE` | `mosad` |

לחץ **Save** — Render יפרוס מחדש אוטומטית.

### 3. ודא שהשרת חי
פתח בדפדפן: `https://computer-room-manager-api.onrender.com/api/v1/health`
צריך להופיע: `{"status":"ok",...}`. (בפעם הראשונה ייקח ~1 דקה להתעורר.)

---

## חלק ב׳ — המסכים (Netlify)

1. Netlify → **Add new site → Import from Git** → בחר את המאגר שלך.
2. Netlify יזהה אוטומטית את הקובץ `netlify.toml` שהכנתי — לא צריך לשנות הגדרות בנייה.
3. לפני הפריסה: **Site settings → Environment variables** → הוסף:
   - `NEXT_PUBLIC_API_URL` = `https://computer-room-manager-api.onrender.com`
4. **Deploy**. בסיום תקבל כתובת כמו `https://your-site.netlify.app`.
5. חזור ל-Render → API → Environment → עדכן `CORS_ORIGIN` לכתובת ה-Netlify → Save.

---

## חלק ג׳ — נדרים פלוס
- הקאלבק שכבר רשמת (`.../api/v1/payments/nedarim/callback`) הוא הנכון. אין צורך בעוד אחד.
- `NEDARIM_CALLBACK_MODE=mosad` כבר גורם למערכת להסתמך עליו.

---

## התחברות ראשונה
כתובת האתר (Netlify) → התחבר עם המשתמש שיצרת ב-seed, או צור בעל עסק חדש.
נתוני דמו (אם הרצת seed): `owner@demo.crm` / `Passw0rd!`.

## מה צריך ממך כדי שאעזור
- כתובת האתר שקיבלת מ-Netlify (כדי לוודא הגדרת CORS).
- **אל תשלח כאן סיסמאות/סודות** — הכנס אותם ישירות ב-Render.
