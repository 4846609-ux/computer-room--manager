'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { UserPlus, Download } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch, apiFetchText } from '@/lib/api';
import type { CustomerRow, Paginated } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface NewCustomer {
  fullName: string;
  phone?: string;
  email?: string;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', q],
    queryFn: () =>
      apiFetch<Paginated<CustomerRow>>(
        `/customers?pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const { register, handleSubmit, reset } = useForm<NewCustomer>();
  const createMutation = useMutation({
    mutationFn: (body: NewCustomer) =>
      apiFetch('/customers', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      reset();
      setShowForm(false);
    },
  });

  async function exportCsv() {
    const csv = await apiFetchText('/exports/customers.csv');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<CustomerRow>[] = [
    { key: 'customerNumber', header: 'מס׳' },
    {
      key: 'fullName',
      header: 'שם',
      render: (r) => (
        <Link href={`/customers/${r.id}`} className="font-medium text-primary hover:underline">
          {r.fullName}
        </Link>
      ),
    },
    { key: 'phone', header: 'טלפון', render: (r) => r.phone ?? '—' },
    { key: 'group', header: 'קבוצה', render: (r) => r.group?.name ?? '—' },
    {
      key: 'money',
      header: 'יתרה כספית',
      render: (r) => formatILS(r.balance?.moneyMinor ?? 0),
    },
    {
      key: 'time',
      header: 'יתרת זמן',
      render: (r) => `${Math.round((r.balance?.timeSecondsRemaining ?? 0) / 60)} דק׳`,
    },
    { key: 'prints', header: 'הדפסות', render: (r) => r.balance?.printBwRemaining ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="לקוחות"
        subtitle="ניהול לקוחות ויתרות"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" aria-hidden />
              ייצוא CSV
            </Button>
            <Button onClick={() => setShowForm((v) => !v)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              לקוח חדש
            </Button>
          </div>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={handleSubmit((v) => createMutation.mutate(v))}
              className="grid grid-cols-1 gap-3 sm:grid-cols-4"
            >
              <Input placeholder="שם מלא" {...register('fullName', { required: true })} />
              <Input placeholder="טלפון" {...register('phone')} />
              <Input placeholder='דוא"ל' type="email" {...register('email')} />
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'שומר…' : 'שמור'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Input
        placeholder="חיפוש לפי שם / טלפון / דוא״ל…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="חיפוש לקוחות"
      />

      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינת הלקוחות — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : (
        <DataTable columns={columns} rows={data?.data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
