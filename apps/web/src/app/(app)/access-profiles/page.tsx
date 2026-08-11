'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShieldCheck, Wand2 } from 'lucide-react';
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  presetForLevel,
  type AccessLevel,
} from '@crm/shared';
import { apiFetch } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface AccessProfile {
  id: string;
  name: string;
  level: AccessLevel;
  allowComputer: boolean;
  allowInternet: boolean;
  allowEmail: boolean;
  allowApps: boolean;
  allowUsb: boolean;
  allowPrinting: boolean;
  blockVideoOnComputer: boolean;
  blockVideoOnInternet: boolean;
  blockedSites: string[];
  allowedSites: string[];
  isDefault: boolean;
}

type FormState = Omit<AccessProfile, 'id' | 'blockedSites' | 'allowedSites'> & {
  blockedSites: string;
  allowedSites: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  level: ACCESS_LEVELS.CUSTOM,
  allowComputer: true,
  allowInternet: true,
  allowEmail: true,
  allowApps: true,
  allowUsb: true,
  allowPrinting: true,
  blockVideoOnComputer: false,
  blockVideoOnInternet: false,
  blockedSites: '',
  allowedSites: '',
  isDefault: false,
};

const CAPABILITY_FIELDS: { key: keyof FormState; label: string; hint?: string }[] = [
  { key: 'allowComputer', label: 'שימוש במחשב', hint: 'כבוי = העמדה נשארת נעולה' },
  { key: 'allowInternet', label: 'גלישה באינטרנט' },
  { key: 'allowEmail', label: 'אימייל / דוא"ל' },
  { key: 'allowApps', label: 'תוכנות (Office וכו׳)' },
  { key: 'allowUsb', label: 'התקני USB / דיסק־און־קי' },
  { key: 'allowPrinting', label: 'הדפסה מהעמדה' },
];

const VIDEO_FIELDS: { key: keyof FormState; label: string; hint: string }[] = [
  { key: 'blockVideoOnComputer', label: 'חסום וידאו מהמחשב', hint: 'קבצי וידאו מקומיים על העמדה' },
  { key: 'blockVideoOnInternet', label: 'חסום וידאו מהאינטרנט', hint: 'יוטיוב, סטרימינג ואתרי וידאו' },
];

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-input bg-card p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-primary"
      />
    </label>
  );
}

export default function AccessProfilesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['access-profiles'],
    queryFn: () => apiFetch<Paginated<AccessProfile>>('/access-profiles?pageSize=100'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['access-profiles'] });
  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const toPayload = (f: FormState) => ({
    name: f.name,
    level: f.level,
    allowComputer: f.allowComputer,
    allowInternet: f.allowInternet,
    allowEmail: f.allowEmail,
    allowApps: f.allowApps,
    allowUsb: f.allowUsb,
    allowPrinting: f.allowPrinting,
    blockVideoOnComputer: f.blockVideoOnComputer,
    blockVideoOnInternet: f.blockVideoOnInternet,
    isDefault: f.isDefault,
    blockedSites: f.blockedSites.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    allowedSites: f.allowedSites.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
  });

  const save = useMutation({
    mutationFn: () =>
      editingId
        ? apiFetch(`/access-profiles/${editingId}`, { method: 'PATCH', body: JSON.stringify(toPayload(form)) })
        : apiFetch('/access-profiles', { method: 'POST', body: JSON.stringify(toPayload(form)) }),
    onSuccess: () => {
      invalidate();
      resetForm();
    },
  });

  const ensureDefaults = useMutation({
    mutationFn: () => apiFetch('/access-profiles/ensure-defaults', { method: 'POST' }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/access-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  // When picking a preset level, prefill switches from that level's preset.
  const applyPreset = (level: AccessLevel) => {
    const p = presetForLevel(level);
    setForm((f) => ({ ...f, level, ...p, blockedSites: p.blockedSites.join('\n'), allowedSites: p.allowedSites.join('\n') }));
  };

  const startEdit = (p: AccessProfile) => {
    setEditingId(p.id);
    setShowForm(true);
    setForm({
      name: p.name,
      level: p.level,
      allowComputer: p.allowComputer,
      allowInternet: p.allowInternet,
      allowEmail: p.allowEmail,
      allowApps: p.allowApps,
      allowUsb: p.allowUsb,
      allowPrinting: p.allowPrinting,
      blockVideoOnComputer: p.blockVideoOnComputer,
      blockVideoOnInternet: p.blockVideoOnInternet,
      isDefault: p.isDefault,
      blockedSites: (p.blockedSites ?? []).join('\n'),
      allowedSites: (p.allowedSites ?? []).join('\n'),
    });
  };

  useEffect(() => {
    if (showForm) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [showForm]);

  const profiles = data?.data ?? [];
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="רמות משתמש (פרופילי גישה)"
        subtitle="הגדר מה מותר בעמדה לכל סוג לקוח — מחשב בלבד, אימייל בלבד, חסימת וידאו או הגדרות מיוחדות"
        action={
          <div className="flex gap-2">
            {profiles.length === 0 && (
              <Button variant="outline" onClick={() => ensureDefaults.mutate()} disabled={ensureDefaults.isPending}>
                <Wand2 className="h-4 w-4" aria-hidden />
                צור רמות ברירת מחדל
              </Button>
            )}
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              רמה חדשה
            </Button>
          </div>
        }
      />

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'עריכת רמה' : 'רמה חדשה'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">שם הרמה</label>
                <Input
                  placeholder="לדוגמה: מחשב בלבד"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">התחל מתבנית</label>
                <select
                  value={form.level}
                  onChange={(e) => applyPreset(e.target.value as AccessLevel)}
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {Object.values(ACCESS_LEVELS).map((lvl) => (
                    <option key={lvl} value={lvl}>{ACCESS_LEVEL_LABELS[lvl]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">מה מותר בעמדה</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CAPABILITY_FIELDS.map((c) => (
                  <Toggle
                    key={c.key}
                    label={c.label}
                    hint={c.hint}
                    checked={Boolean(form[c.key])}
                    onChange={(v) => set({ [c.key]: v } as Partial<FormState>)}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">חסימת וידאו (אפשר להפריד בין מחשב לאינטרנט)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {VIDEO_FIELDS.map((c) => (
                  <Toggle
                    key={c.key}
                    label={c.label}
                    hint={c.hint}
                    checked={Boolean(form[c.key])}
                    onChange={(v) => set({ [c.key]: v } as Partial<FormState>)}
                  />
                ))}
              </div>
            </div>

            {form.allowInternet && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">אתרים חסומים</label>
                  <textarea
                    placeholder="אתר בכל שורה — למשל: facebook.com"
                    value={form.blockedSites}
                    onChange={(e) => set({ blockedSites: e.target.value })}
                    className="min-h-[90px] w-full rounded-md border border-input bg-card p-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">אתרים מותרים בלבד (רשימת היתר)</label>
                  <textarea
                    placeholder="השאר ריק לגלישה חופשית"
                    value={form.allowedSites}
                    onChange={(e) => set({ allowedSites: e.target.value })}
                    className="min-h-[90px] w-full rounded-md border border-input bg-card p-3 text-sm"
                  />
                </div>
              </div>
            )}

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => set({ isDefault: e.target.checked })}
                className="h-5 w-5 accent-primary"
              />
              קבע כרמת ברירת מחדל
            </label>

            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
                {save.isPending ? 'שומר…' : editingId ? 'עדכן רמה' : 'צור רמה'}
              </Button>
              <Button variant="outline" onClick={resetForm}>ביטול</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינה — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">טוען…</p>
      ) : profiles.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            עדיין אין רמות משתמש. לחץ על "צור רמות ברירת מחדל" כדי להתחיל במהירות.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                    <span className="font-semibold">{p.name}</span>
                  </div>
                  {p.isDefault && <Badge>ברירת מחדל</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{ACCESS_LEVEL_LABELS[p.level]}</p>
                <ul className="flex flex-col gap-1 text-sm">
                  <li>{p.allowInternet ? '🌐 אינטרנט' : '🚫 ללא אינטרנט'}</li>
                  <li>{p.allowEmail ? '✉️ אימייל' : '🚫 ללא אימייל'}</li>
                  {(p.blockVideoOnComputer || p.blockVideoOnInternet) && (
                    <li className="text-status-fault">
                      🎬 וידאו חסום: {[p.blockVideoOnComputer && 'מחשב', p.blockVideoOnInternet && 'אינטרנט'].filter(Boolean).join(' + ')}
                    </li>
                  )}
                </ul>
                <div className="mt-auto flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(p)}>ערוך</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`למחוק את הרמה "${p.name}"?`)) remove.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
