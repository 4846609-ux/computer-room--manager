'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Square, Pause, Play } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Paginated, SessionRow } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';

const BILLING_LABEL: Record<string, string> = {
  TIME_PACKAGE: 'חבילת זמן',
  MONEY_BALANCE: 'יתרה כספית',
  PAY_PER_USE: 'חיוב לפי שימוש',
  FREE: 'חינם',
  SUBSCRIPTION: 'מנוי',
};

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions', 'active'],
    queryFn: () => apiFetch<Paginated<SessionRow>>('/sessions?active=true&pageSize=100'),
    refetchInterval: 15_000,
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/sessions/${id}/close`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume' }) =>
      apiFetch(`/sessions/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const columns: Column<SessionRow>[] = [
    {
      key: 'computer',
      header: 'עמדה',
      render: (r) => r.computer?.stationNumber ?? r.computer?.name ?? '—',
    },
    { key: 'customer', header: 'לקוח', render: (r) => r.customer?.fullName ?? 'אורח' },
    { key: 'billingSource', header: 'מקור חיוב', render: (r) => BILLING_LABEL[r.billingSource] ?? r.billingSource },
    {
      key: 'startedAt',
      header: 'התחיל',
      render: (r) =>
        r.startedAt ? new Date(r.startedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—',
    },
    { key: 'amountMinor', header: 'חיוב מצטבר', render: (r) => formatILS(r.amountMinor) },
    {
      key: 'actions',
      header: 'פעולות',
      render: (r) => (
        <div className="flex gap-1">
          {r.status === 'PAUSED' ? (
            <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: r.id, action: 'resume' })} aria-label="חידוש">
              <Play className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: r.id, action: 'pause' })} aria-label="השהיה">
              <Pause className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            disabled={closeMutation.isPending}
            onClick={() => closeMutation.mutate(r.id)}
            aria-label={`סיום שימוש בעמדה ${r.computer?.name ?? ''}`}
          >
            <Square className="h-4 w-4" aria-hidden />
            סיום
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="שימושים פעילים" subtitle="מתעדכן אוטומטית כל 15 שניות" />
      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינת השימושים — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          isLoading={isLoading}
          emptyText="אין שימושים פעילים כרגע"
        />
      )}
    </div>
  );
}
