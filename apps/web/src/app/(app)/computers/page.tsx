'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw, Lock, Plus, Download, X, Copy } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';
import type { ComputerRow, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

async function sendCommand(id: string, action: string) {
  await apiFetch(`/computers/${id}/command`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

interface ProvisionResult {
  installToken: string;
  tokenExpires: string;
}
interface NewComputer {
  name: string;
  systemId: string;
  stationNumber?: string;
}

export default function ComputersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [tokenFor, setTokenFor] = useState<{ computer: ComputerRow; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['computers'],
    queryFn: () => apiFetch<Paginated<ComputerRow>>('/computers?pageSize=100'),
  });

  const { register, handleSubmit, reset } = useForm<NewComputer>();
  const create = useMutation({
    mutationFn: (v: NewComputer) => apiFetch('/computers', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['computers'] });
      reset();
      setShowForm(false);
    },
  });

  const provision = useMutation({
    mutationFn: (computer: ComputerRow) =>
      apiFetch<ProvisionResult>('/agent/provision', {
        method: 'POST',
        body: JSON.stringify({ computerId: computer.id }),
      }).then((r) => ({ computer, token: r.installToken })),
    onSuccess: (r) => {
      setTokenFor(r);
      setCopied(false);
    },
  });

  const columns: Column<ComputerRow>[] = [
    { key: 'stationNumber', header: 'עמדה', render: (r) => r.stationNumber ?? '—' },
    { key: 'name', header: 'שם' },
    { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'group', header: 'קבוצה', render: (r) => r.group?.name ?? '—' },
    { key: 'localIp', header: 'IP', render: (r) => r.localIp ?? '—' },
    {
      key: 'agent',
      header: 'Agent',
      render: (r) =>
        r.agent?.isOnline ? (
          <span className="text-status-available">מחובר</span>
        ) : (
          <span className="text-muted-foreground">לא מחובר</span>
        ),
    },
    {
      key: 'actions',
      header: 'פעולות',
      render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => provision.mutate(r)} aria-label={`התקנת סוכן ${r.name}`}>
            <Download className="h-4 w-4" aria-hidden />
            סוכן
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await sendCommand(r.id, 'RESTART').catch(() => {});
              refetch();
            }}
            aria-label={`הפעלה מחדש ${r.name}`}
          >
            <RotateCw className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendCommand(r.id, 'LOCK').catch(() => {})}
            aria-label={`נעילה ${r.name}`}
          >
            <Lock className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="מחשבים"
        subtitle="ניהול עמדות, פעולות מרחוק והתקנת הסוכן"
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden />
            מחשב חדש
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="grid grid-cols-1 gap-3 sm:grid-cols-4"
            >
              <Input placeholder="שם המחשב" {...register('name', { required: true })} />
              <Input placeholder='מזהה מערכת (שם ה-PC ב-Windows)' {...register('systemId', { required: true })} />
              <Input placeholder="מס׳ עמדה (לא חובה)" {...register('stationNumber')} />
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'שומר…' : 'צור מחשב'}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              "מזהה מערכת" חייב להיות זהה לשם המחשב ב-Windows (מתמלא אוטומטית ע"י המתקין).
            </p>
          </CardContent>
        </Card>
      )}

      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינת המחשבים — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable columns={columns} rows={data?.data ?? []} isLoading={isLoading} emptyText="אין מחשבים — צור מחשב חדש" />
      )}

      {/* Install-token dialog */}
      {tokenFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTokenFor(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">התקנת הסוכן על "{tokenFor.computer.name}"</h2>
                <button onClick={() => setTokenFor(null)} aria-label="סגור">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <ol className="list-inside list-decimal space-y-1 text-sm">
                <li>הורד את קובץ ההתקנה של הסוכן (ZIP) ופתח אותו על המחשב.</li>
                <li>ודא ששם המחשב ב-Windows הוא בדיוק: <b>{tokenFor.computer.name || '—'}</b> או עדכן את "מזהה מערכת".</li>
                <li>לחץ פעמיים על <b>Install.bat</b> ← אשר "כן" ← הדבק את הקוד הבא כשמבקשים:</li>
              </ol>

              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-secondary px-3 py-2 text-sm">{tokenFor.token}</code>
                <Button
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(tokenFor.token);
                    setCopied(true);
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden />
                  {copied ? 'הועתק' : 'העתק'}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                הקוד חד־פעמי ותקף לזמן מוגבל. אם פג — לחץ שוב על "סוכן" כדי להפיק קוד חדש.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
