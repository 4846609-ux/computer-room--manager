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
