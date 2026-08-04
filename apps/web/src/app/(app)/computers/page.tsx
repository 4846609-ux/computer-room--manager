'use client';

import { useQuery } from '@tanstack/react-query';
import { RotateCw, Lock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { ComputerRow, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

async function sendCommand(id: string, action: string) {
  await apiFetch(`/computers/${id}/command`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export default function ComputersPage() {
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['computers'],
    queryFn: () => apiFetch<Paginated<ComputerRow>>('/computers?pageSize=100'),
  });

  const columns: Column<ComputerRow>[] = [
    { key: 'stationNumber', header: 'עמדה', render: (r) => r.stationNumber ?? '—' },
    { key: 'name', header: 'שם' },
    { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'group', header: 'קבוצה', render: (r) => r.group?.name ?? '—' },
    {
      key: 'ratio',
      header: 'יחס חיוב',
      render: (r) => (r.group ? `×${r.group.billingRatio}` : '—'),
    },
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
            onClick={async () => {
              await sendCommand(r.id, 'LOCK').catch(() => {});
            }}
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
      <PageHeader title="מחשבים" subtitle="ניהול עמדות ופעולות מרחוק" />
      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינת המחשבים — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable columns={columns} rows={data?.data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
