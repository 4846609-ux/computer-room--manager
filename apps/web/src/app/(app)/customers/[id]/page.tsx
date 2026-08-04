'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Wallet, Clock, Printer } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CustomerDetail {
  id: string;
  customerNumber: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  group?: { name: string } | null;
  balance?: {
    moneyMinor: number;
    timeSecondsRemaining: number;
    printBwRemaining: number;
    printColorRemaining: number;
    debtMinor: number;
  } | null;
}

interface LedgerTx {
  id: string;
  kind: string;
  unit: string;
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  LOAD: 'טעינה',
  USAGE: 'שימוש',
  PRINT: 'הדפסה',
  REFUND: 'החזר',
  ADJUST: 'התאמה',
  TRANSFER: 'העברה',
  PACKAGE: 'חבילה',
  BONUS: 'בונוס',
  EXPIRY: 'פקיעה',
  COUPON: 'קופון',
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('MONEY');

  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => apiFetch<CustomerDetail>(`/customers/${id}`),
  });
  const { data: txs } = useQuery({
    queryKey: ['customer-tx', id],
    queryFn: () => apiFetch<{ data: LedgerTx[] }>(`/customers/${id}/balance/transactions?pageSize=50`),
  });

  const load = useMutation({
    mutationFn: () =>
      apiFetch(`/customers/${id}/balance/load`, {
        method: 'POST',
        body: JSON.stringify({ unit, amount: Number(amount) }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customer-tx', id] });
      setAmount('');
    },
  });

  const b = customer?.balance;
  const columns: Column<LedgerTx>[] = [
    { key: 'createdAt', header: 'תאריך', render: (t) => new Date(t.createdAt).toLocaleString('he-IL') },
    { key: 'kind', header: 'סוג', render: (t) => KIND_LABEL[t.kind] ?? t.kind },
    { key: 'unit', header: 'יחידה', render: (t) => t.unit },
    {
      key: 'amount',
      header: 'שינוי',
      render: (t) => (
        <span className={t.amount < 0 ? 'text-status-fault' : 'text-status-available'}>
          {t.amount > 0 ? '+' : ''}
          {t.amount}
        </span>
      ),
    },
    { key: 'balanceAfter', header: 'יתרה', render: (t) => t.balanceAfter },
    { key: 'reason', header: 'סיבה', render: (t) => t.reason ?? '—' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/customers" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" aria-hidden />
        חזרה ללקוחות
      </Link>

      <PageHeader
        title={customer?.fullName ?? 'לקוח'}
        subtitle={customer ? `מס׳ ${customer.customerNumber} · ${customer.phone ?? ''}` : ''}
        action={customer ? <Badge>{customer.group?.name ?? 'ללא קבוצה'}</Badge> : null}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex items-center gap-3 p-4">
          <Wallet className="h-6 w-6 text-primary" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">יתרה כספית</p>
            <p className="text-lg font-bold">{formatILS(b?.moneyMinor ?? 0)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <Clock className="h-6 w-6 text-status-inUse" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">יתרת זמן</p>
            <p className="text-lg font-bold">{Math.round((b?.timeSecondsRemaining ?? 0) / 60)} דק׳</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <Printer className="h-6 w-6 text-foreground" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">הדפסות ש/ל</p>
            <p className="text-lg font-bold">{b?.printBwRemaining ?? 0}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <Printer className="h-6 w-6 text-status-ending" aria-hidden />
          <div>
            <p className="text-sm text-muted-foreground">חוב</p>
            <p className="text-lg font-bold">{formatILS(b?.debtMinor ?? 0)}</p>
          </div>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>טעינת יתרה</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
              <option value="MONEY">כסף (אגורות)</option>
              <option value="TIME_SECONDS">זמן (שניות)</option>
              <option value="PRINT_BW">הדפסות ש/ל</option>
              <option value="PRINT_COLOR">הדפסות צבע</option>
            </select>
            <Input type="number" placeholder="כמות" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-[160px]" />
            <Button onClick={() => load.mutate()} disabled={!amount || load.isPending}>
              {load.isPending ? 'טוען…' : 'טען'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>תנועות יתרה (ledger)</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={txs?.data ?? []} emptyText="אין תנועות" />
        </CardContent>
      </Card>
    </div>
  );
}
