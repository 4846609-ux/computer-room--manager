'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';
import type { Paginated, TicketRow } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'חדש',
  IN_PROGRESS: 'בטיפול',
  WAITING_PART: 'ממתין לחלק',
  WAITING_SUPPLIER: 'ממתין לספק',
  RESOLVED: 'נפתר',
  CLOSED: 'נסגר',
  REOPENED: 'נפתח מחדש',
};
const CATEGORY_LABEL: Record<string, string> = {
  HARDWARE: 'חומרה',
  SOFTWARE: 'תוכנה',
  NETWORK: 'רשת',
  PRINTING: 'הדפסה',
  PAYMENT: 'תשלום',
  OTHER: 'אחר',
};
const NEXT_STATUS: Record<string, string> = {
  NEW: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
  RESOLVED: 'CLOSED',
};

interface NewTicket {
  title: string;
  category: string;
}

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ['branches', 'maint'],
    queryFn: () => apiFetch<Paginated<{ id: string; name: string }>>('/branches'),
  });
  const branchId = branches?.data?.[0]?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => apiFetch<TicketRow[]>('/maintenance/tickets'),
  });

  const { register, handleSubmit, reset } = useForm<NewTicket>({ defaultValues: { category: 'HARDWARE' } });
  const create = useMutation({
    mutationFn: (v: NewTicket) =>
      apiFetch('/maintenance/tickets', { method: 'POST', body: JSON.stringify({ ...v, branchId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      reset();
      setShowForm(false);
    },
  });
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/maintenance/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const columns: Column<TicketRow>[] = [
    { key: 'number', header: 'מס׳', render: (r) => `#${r.number}` },
    { key: 'title', header: 'נושא' },
    { key: 'category', header: 'קטגוריה', render: (r) => CATEGORY_LABEL[r.category] ?? r.category },
    { key: 'computer', header: 'מחשב', render: (r) => r.computer?.name ?? '—' },
    { key: 'status', header: 'סטטוס', render: (r) => <Badge>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    {
      key: 'actions',
      header: 'פעולות',
      render: (r) =>
        NEXT_STATUS[r.status] ? (
          <Button size="sm" variant="outline" onClick={() => advance.mutate({ id: r.id, status: NEXT_STATUS[r.status] })}>
            → {STATUS_LABEL[NEXT_STATUS[r.status]]}
          </Button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="תחזוקה ותקלות"
        subtitle="קריאות שירות פנימיות"
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden />
            קריאה חדשה
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
            >
              <Input placeholder="תיאור התקלה" {...register('title', { required: true })} />
              <select
                {...register('category')}
                className="h-11 rounded-md border border-input bg-card px-3 text-sm"
              >
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <Button type="submit" disabled={create.isPending || !branchId}>
                {create.isPending ? 'שומר…' : 'פתח קריאה'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינה — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable columns={columns} rows={data ?? []} isLoading={isLoading} emptyText="אין קריאות פתוחות" />
      )}
    </div>
  );
}
