'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface EmployeeRow {
  id: string;
  fullName: string;
  email: string;
  status: string;
  twoFactorEnabled: boolean;
  roles: { role: { key: string; name: string } }[];
}
interface RoleRow {
  id: string;
  key: string;
  name: string;
}
interface NewEmployee {
  fullName: string;
  email: string;
  password: string;
  roleKey: string;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'פעיל', SUSPENDED: 'מושהה', INACTIVE: 'לא פעיל' };

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiFetch<EmployeeRow[]>('/employees'),
  });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => apiFetch<RoleRow[]>('/roles') });

  const { register, handleSubmit, reset } = useForm<NewEmployee>();
  const create = useMutation({
    mutationFn: (v: NewEmployee) =>
      apiFetch('/employees', {
        method: 'POST',
        body: JSON.stringify({
          fullName: v.fullName,
          email: v.email,
          password: v.password,
          roleKeys: [v.roleKey],
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      reset();
      setShowForm(false);
    },
  });

  const columns: Column<EmployeeRow>[] = [
    { key: 'fullName', header: 'שם' },
    { key: 'email', header: 'דוא"ל' },
    { key: 'roles', header: 'תפקידים', render: (r) => r.roles.map((x) => x.role.name).join(', ') || '—' },
    { key: '2fa', header: '2FA', render: (r) => (r.twoFactorEnabled ? 'מופעל' : '—') },
    { key: 'status', header: 'סטטוס', render: (r) => <Badge>{STATUS_LABEL[r.status] ?? r.status}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="עובדים"
        subtitle="ניהול עובדים והרשאות"
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            עובד חדש
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit((v) => create.mutate(v))} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              <Input placeholder="שם מלא" {...register('fullName', { required: true })} />
              <Input placeholder='דוא"ל' type="email" {...register('email', { required: true })} />
              <Input placeholder="סיסמה" type="password" {...register('password', { required: true, minLength: 8 })} />
              <select {...register('roleKey', { required: true })} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
                <option value="">תפקיד…</option>
                {roles?.map((r) => (
                  <option key={r.id} value={r.key}>{r.name}</option>
                ))}
              </select>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'שומר…' : 'הוסף'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {error ? (
        <p className="rounded-md bg-status-fault/10 px-4 py-3 text-sm text-status-fault">
          שגיאה בטעינה — ודא שאתה מחובר ובעל הרשאת ניהול עובדים.
        </p>
      ) : (
        <DataTable columns={columns} rows={data ?? []} isLoading={isLoading} emptyText="אין עובדים" />
      )}
    </div>
  );
}
