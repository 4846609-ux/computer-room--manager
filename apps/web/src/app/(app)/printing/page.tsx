'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { PrintJobRow } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'ממתין לאישור',
  APPROVED: 'אושר',
  PRINTING: 'מדפיס',
  COMPLETED: 'הושלם',
  CANCELLED: 'בוטל',
  FAILED: 'נכשל',
};

export default function PrintingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['print-jobs'],
    queryFn: () => apiFetch<PrintJobRow[]>('/print-jobs'),
    refetchInterval: 15_000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => apiFetch(`/print-jobs/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['print-jobs'] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch(`/print-jobs/${id}/cancel`, { method: 'POST', body: '{}' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['print-jobs'] }),
  });

  const columns: Column<PrintJobRow>[] = [
    { key: 'documentName', header: 'מסמך', render: (r) => r.documentName ?? '—' },
    { key: 'customer', header: 'לקוח', render: (r) => r.customer?.fullName ?? '—' },
    { key: 'pages', header: 'עמודים', render: (r) => `${r.pages}×${r.copies}` },
    {
      key: 'colorMode',
      header: 'סוג',
      render: (r) => (r.colorMode === 'COLOR' ? 'צבע' : 'שחור-לבן'),
    },
    { key: 'total', header: 'עלות', render: (r) => formatILS(r.totalMinor) },
    { key: 'status', header: 'סטטוס', render: (r) => <Badge>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    {
      key: 'actions',
      header: 'פעולות',
      render: (r) =>
        r.status === 'PENDING_APPROVAL' ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => approve.mutate(r.id)} aria-label="אשר">
              <Check className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="sm" variant="outline" onClick={() => cancel.mutate(r.id)} aria-label="בטל">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הדפסות" subtitle="עבודות הדפסה — אישור וחיוב" />
      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינה — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable columns={columns} rows={data ?? []} isLoading={isLoading} emptyText="אין עבודות הדפסה" />
      )}
    </div>
  );
}
