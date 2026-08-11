'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => apiFetch<Paginated<AuditRow>>('/audit?pageSize=100'),
  });

  const columns: Column<AuditRow>[] = [
    { key: 'createdAt', header: 'תאריך', render: (r) => new Date(r.createdAt).toLocaleString('he-IL') },
    { key: 'action', header: 'פעולה', render: (r) => <Badge>{r.action}</Badge> },
    { key: 'entity', header: 'ישות' },
    { key: 'entityId', header: 'מזהה', render: (r) => r.entityId ?? '—' },
    { key: 'actorId', header: 'מבצע', render: (r) => r.actorId ?? 'מערכת' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="יומן פעילות"
        subtitle="תיעוד קריאה־בלבד של כל הפעולות במערכת (לא ניתן לעריכה או מחיקה)"
      />
      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינה — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable columns={columns} rows={data?.data ?? []} isLoading={isLoading} emptyText="אין רשומות ביומן" />
      )}
    </div>
  );
}
