'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';
import type { Paginated } from '@/lib/types';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface BranchRow {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}

interface NewBranch {
  name: string;
  code: string;
  address?: string;
  phone?: string;
}

export default function BranchesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['branches', 'page'],
    queryFn: () => apiFetch<Paginated<BranchRow>>('/branches?pageSize=100'),
  });

  const { register, handleSubmit, reset } = useForm<NewBranch>();
  const create = useMutation({
    mutationFn: (v: NewBranch) => apiFetch('/branches', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      reset();
      setShowForm(false);
    },
  });

  const columns: Column<BranchRow>[] = [
    { key: 'name', header: 'סניף' },
    { key: 'code', header: 'קוד' },
    { key: 'address', header: 'כתובת', render: (r) => r.address ?? '—' },
    { key: 'phone', header: 'טלפון', render: (r) => r.phone ?? '—' },
    {
      key: 'isActive',
      header: 'סטטוס',
      render: (r) => <Badge>{r.isActive ? 'פעיל' : 'כבוי'}</Badge>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="סניפים"
        subtitle="ניהול הסניפים של העסק"
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden />
            סניף חדש
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Input placeholder="שם הסניף" {...register('name', { required: true })} />
              <Input placeholder="קוד (למשל CENTER)" {...register('code', { required: true })} />
              <Input placeholder="כתובת" {...register('address')} />
              <Input placeholder="טלפון" {...register('phone')} />
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'שומר…' : 'צור סניף'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינה — ודא שאתה מחובר ושהשרת פועל.
        </p>
      ) : data && data.data.length === 0 && !isLoading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Building2 className="h-8 w-8" aria-hidden />
            עדיין אין סניפים. צור את הסניף הראשון.
          </CardContent>
        </Card>
      ) : (
        <DataTable columns={columns} rows={data?.data ?? []} isLoading={isLoading} emptyText="אין סניפים" />
      )}
    </div>
  );
}
