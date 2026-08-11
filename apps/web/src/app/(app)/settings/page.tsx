'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Me {
  fullName: string;
  email: string;
  twoFactorEnabled: boolean;
  roles: string[];
}

interface OrgSettings {
  currency: string;
  timezone: string;
  vatPercent: number;
  roundingRule: string;
  retentionDays: number;
}

function OrgSettingsCard() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => apiFetch<OrgSettings>('/settings/org'),
    retry: false,
  });
  const [form, setForm] = useState<Partial<OrgSettings>>({});
  const current = { ...data, ...form } as OrgSettings;

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/settings/org', {
        method: 'PATCH',
        body: JSON.stringify({
          vatPercent: Number(current.vatPercent),
          currency: current.currency,
          timezone: current.timezone,
          roundingRule: current.roundingRule,
          retentionDays: Number(current.retentionDays),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (!data) return null;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>הגדרות ארגון</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          מע"מ (%)
          <Input
            type="number"
            value={current.vatPercent ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, vatPercent: Number(e.target.value) }))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          מטבע
          <Input value={current.currency ?? ''} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          אזור זמן
          <Input value={current.timezone ?? ''} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          שמירת נתונים (ימים)
          <Input
            type="number"
            value={current.retentionDays ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, retentionDays: Number(e.target.value) }))}
          />
        </label>
        <div className="col-span-2 flex items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'שומר…' : 'שמור'}
          </Button>
          {saved && <span className="text-sm text-status-available">נשמר ✓</span>}
        </div>
      </CardContent>
    </Card>
  );
}

interface KioskSettings {
  requireCustomerName: boolean;
  requireCustomerEmail: boolean;
  autoDisconnectEnabled: boolean;
  autoDisconnectMinutes: number;
  machineUnlockCode: string | null;
  receiptEmail: string | null;
}

function KioskToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="col-span-2 flex cursor-pointer items-start justify-between gap-3 rounded-md border border-input p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 accent-primary" />
    </label>
  );
}

function KioskSettingsCard() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { data } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => apiFetch<KioskSettings>('/settings/org'),
    retry: false,
  });
  const [form, setForm] = useState<Partial<KioskSettings>>({});
  const current = { ...data, ...form } as KioskSettings;
  const set = (patch: Partial<KioskSettings>) => setForm((f) => ({ ...f, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/settings/org', {
        method: 'PATCH',
        body: JSON.stringify({
          requireCustomerName: !!current.requireCustomerName,
          requireCustomerEmail: !!current.requireCustomerEmail,
          autoDisconnectEnabled: !!current.autoDisconnectEnabled,
          autoDisconnectMinutes: Number(current.autoDisconnectMinutes) || 3,
          machineUnlockCode: current.machineUnlockCode ?? '',
          receiptEmail: current.receiptEmail ?? '',
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (!data) return null;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>הגדרות קיוסק / שירות עצמי</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <KioskToggle
          label="חובה להזין שם"
          hint="הלקוח לא יוכל להתחבר בעמדה בלי שם"
          checked={!!current.requireCustomerName}
          onChange={(v) => set({ requireCustomerName: v })}
        />
        <KioskToggle
          label="חובה להזין כתובת מייל"
          hint={'לצורך שליחת קבלה בדוא"ל'}
          checked={!!current.requireCustomerEmail}
          onChange={(v) => set({ requireCustomerEmail: v })}
        />
        <KioskToggle
          label="ניתוק אוטומטי של הלקוח"
          hint="ניתוק אחרי חוסר פעילות במשך מספר דקות"
          checked={!!current.autoDisconnectEnabled}
          onChange={(v) => set({ autoDisconnectEnabled: v })}
        />
        <label className="flex flex-col gap-1 text-sm">
          ניתוק אוטומטי אחרי (דקות)
          <Input
            type="number"
            value={current.autoDisconnectMinutes ?? 3}
            onChange={(e) => set({ autoDisconnectMinutes: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          קוד שחרור מכונה
          <Input
            value={current.machineUnlockCode ?? ''}
            onChange={(e) => set({ machineUnlockCode: e.target.value })}
            placeholder="למשל 2035"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          כתובת מייל לשליחת קבלות
          <Input
            value={current.receiptEmail ?? ''}
            onChange={(e) => set({ receiptEmail: e.target.value })}
            placeholder="name@example.com"
          />
        </label>
        <div className="col-span-2 flex items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'שומר…' : 'שמור'}
          </Button>
          {saved && <span className="text-sm text-status-available">נשמר ✓</span>}
        </div>
      </CardContent>
    </Card>
  );
}

interface ConsentDoc {
  id: string;
  key: string;
  title: string;
  version: number;
}

function ConsentDocsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ key: 'TERMS', title: '', content: '' });
  const { data } = useQuery({
    queryKey: ['consents'],
    queryFn: () => apiFetch<ConsentDoc[]>('/consents'),
    retry: false,
  });
  const create = useMutation({
    mutationFn: () => apiFetch('/consents', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consents'] });
      setForm({ key: 'TERMS', title: '', content: '' });
    },
  });

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>מסמכי הסכמה ותקנון</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(data ?? []).map((d) => (
          <div key={d.id} className="flex justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span>{d.title}</span>
            <span className="text-muted-foreground">{d.key} · גרסה {d.version}</span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="TERMS">תנאי שימוש</option>
            <option value="PRIVACY">מדיניות פרטיות</option>
            <option value="USAGE">הסכמה לשימוש</option>
            <option value="PARENTAL">אישור הורה</option>
          </select>
          <Input placeholder="כותרת" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <textarea
            placeholder="תוכן המסמך"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className="col-span-2 min-h-20 rounded-md border border-input bg-card px-3 py-2 text-sm"
          />
        </div>
        <Button
          onClick={() => create.mutate()}
          disabled={!form.title || !form.content || create.isPending}
          className="w-fit"
        >
          שמור גרסה חדשה
        </Button>
      </CardContent>
    </Card>
  );
}

interface Template {
  id: string;
  key: string;
  channel: string;
  body: string;
}

function TemplatesCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ key: 'SESSION_ENDING', channel: 'SMS', body: '' });
  const { data } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<Template[]>('/templates'),
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => apiFetch('/templates', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setForm((f) => ({ ...f, body: '' }));
    },
  });

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>תבניות הודעה</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(data ?? []).map((t) => (
          <div key={t.id} className="rounded-md border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t.key} · {t.channel}</span>
            <p className="truncate">{t.body}</p>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="מפתח (SESSION_ENDING)" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
          <select
            value={form.channel}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
            className="h-11 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="SMS">SMS</option>
            <option value="EMAIL">דוא"ל</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="ON_SCREEN">על המסך</option>
          </select>
          <textarea
            placeholder="תוכן ההודעה (ניתן {{name}}, {{minutes}})"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            className="col-span-2 min-h-16 rounded-md border border-input bg-card px-3 py-2 text-sm"
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={!form.body || save.isPending} className="w-fit">
          שמור תבנית
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => apiFetch<Me>('/auth/me'), retry: false });

  const startSetup = useMutation({
    mutationFn: () => apiFetch<{ secret: string; otpauthUri: string }>('/auth/2fa/setup', { method: 'POST' }),
    onSuccess: (d) => setSetup(d),
  });
  const enable = useMutation({
    mutationFn: () => apiFetch('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: () => {
      setMsg('אימות דו-שלבי הופעל');
      setSetup(null);
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setMsg(e instanceof ApiError ? e.message : 'שגיאה'),
  });
  const disable = useMutation({
    mutationFn: () => apiFetch('/auth/2fa/disable', { method: 'POST' }),
    onSuccess: () => {
      setMsg('אימות דו-שלבי כובה');
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הגדרות" subtitle="חשבון ואבטחה" />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>פרטי חשבון</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <div>שם: {me?.fullName ?? '—'}</div>
          <div>דוא"ל: {me?.email ?? '—'}</div>
          <div>תפקידים: {me?.roles?.join(', ') ?? '—'}</div>
        </CardContent>
      </Card>

      <OrgSettingsCard />
      <KioskSettingsCard />
      <ConsentDocsCard />
      <TemplatesCard />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>אימות דו-שלבי (2FA)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            מצב נוכחי:{' '}
            {me?.twoFactorEnabled ? (
              <span className="text-status-available">מופעל</span>
            ) : (
              <span className="text-muted-foreground">כבוי</span>
            )}
          </p>

          {msg && <p className="rounded-md bg-secondary px-3 py-2 text-sm">{msg}</p>}

          {me?.twoFactorEnabled ? (
            <Button variant="danger" onClick={() => disable.mutate()} className="w-fit">
              <ShieldOff className="h-4 w-4" aria-hidden />
              כיבוי 2FA
            </Button>
          ) : setup ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                הוסף את החשבון לאפליקציית אימות (Google Authenticator וכד׳) באמצעות המפתח:
              </p>
              <code className="break-all rounded-md bg-secondary px-3 py-2 text-sm">{setup.secret}</code>
              <p className="break-all text-xs text-muted-foreground">{setup.otpauthUri}</p>
              <div className="flex gap-2">
                <Input
                  placeholder="קוד בן 6 ספרות"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  className="max-w-[160px]"
                />
                <Button onClick={() => enable.mutate()} disabled={code.length !== 6 || enable.isPending}>
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  הפעל
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => startSetup.mutate()} className="w-fit" disabled={startSetup.isPending}>
              <ShieldCheck className="h-4 w-4" aria-hidden />
              הגדרת אימות דו-שלבי
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
