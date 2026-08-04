'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, X, LogIn } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';
import type { CustomerRow, Paginated, ReservationRow } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'ממתין',
  CONFIRMED: 'אושר',
  CHECKED_IN: 'הגיע',
  NO_SHOW: 'לא הגיע',
  CANCELLED: 'בוטל',
  COMPLETED: 'הושלם',
};

interface NewReservation {
  customerId: string;
  startAt: string;
  durationMin: number;
}

export default function ReservationsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ['branches', 'resv'],
    queryFn: () => apiFetch<Paginated<{ id: string; name: string }>>('/branches'),
  });
  const branchId = branches?.data?.[0]?.id;

  const { data: customers } = useQuery({
    queryKey: ['customers', 'resv'],
    queryFn: () => apiFetch<Paginated<CustomerRow>>('/customers?pageSize=100'),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => apiFetch<ReservationRow[]>('/reservations'),
  });

  const { register, handleSubmit, reset } = useForm<NewReservation>({ defaultValues: { durationMin: 60 } });
  const create = useMutation({
    mutationFn: (v: NewReservation) =>
      apiFetch('/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ...v,
          branchId,
          durationMin: Number(v.durationMin),
          startAt: new Date(v.startAt).toISOString(),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      reset();
      setShowForm(false);
    },
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch(`/reservations/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }),
  });

  const columns: Column<ReservationRow>[] = [
    {
      key: 'startAt',
      header: 'מועד',
      render: (r) => new Date(r.startAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }),
    },
    { key: 'customer', header: 'לקוח', render: (r) => r.customer?.fullName ?? '—' },
    { key: 'durationMin', header: 'משך', render: (r) => `${r.durationMin} דק׳` },
    { key: 'code', header: 'קוד', render: (r) => r.confirmationCode ?? '—' },
    { key: 'status', header: 'סטטוס', render: (r) => <Badge>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
    {
      key: 'actions',
      header: 'פעולות',
      render: (r) => (
        <div className="flex gap-1">
          {r.status === 'PENDING' && (
            <Button size="sm" variant="outline" onClick={() => act.mutate({ id: r.id, action: 'confirm' })} aria-label="אשר">
              <Check className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {(r.status === 'CONFIRMED' || r.status === 'PENDING') && (
            <Button size="sm" variant="outline" onClick={() => act.mutate({ id: r.id, action: 'check-in' })} aria-label="צ׳ק-אין">
              <LogIn className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {['PENDING', 'CONFIRMED'].includes(r.status) && (
            <Button size="sm" variant="outline" onClick={() => act.mutate({ id: r.id, action: 'cancel' })} aria-label="בטל">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="הזמנות מראש"
        subtitle="ניהול הזמנות עמדות"
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            הזמנה חדשה
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <select
                {...register('customerId', { required: true })}
                className="h-11 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">בחר לקוח…</option>
                {customers?.data?.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
              <Input type="datetime-local" {...register('startAt', { required: true })} />
              <Input type="number" min={15} step={15} {...register('durationMin')} aria-label="משך בדקות" />
              <Button type="submit" disabled={create.isPending || !branchId}>
                {create.isPending ? 'שומר…' : 'צור הזמנה'}
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
        <DataTable columns={columns} rows={data ?? []} isLoading={isLoading} emptyText="אין הזמנות" />
      )}
    </div>
  );
}
