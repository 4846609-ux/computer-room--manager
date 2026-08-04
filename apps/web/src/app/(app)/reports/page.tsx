'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { RevenueReport, UsageReport } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Receipt, Clock, TrendingUp } from 'lucide-react';

const PRESETS = [
  { value: 'today', label: 'היום' },
  { value: 'yesterday', label: 'אתמול' },
  { value: 'week', label: 'השבוע' },
  { value: 'month', label: 'החודש' },
  { value: 'quarter', label: 'רבעון' },
  { value: 'year', label: 'שנה' },
];

const METHOD_LABEL: Record<string, string> = {
  CASH: 'מזומן',
  CARD: 'אשראי',
  WALLET: 'ארנק דיגיטלי',
  BANK_TRANSFER: 'העברה בנקאית',
};

export default function ReportsPage() {
  const [preset, setPreset] = useState('month');

  const { data: revenue } = useQuery({
    queryKey: ['report-revenue', preset],
    queryFn: () => apiFetch<RevenueReport>(`/reports/revenue?preset=${preset}`),
    retry: false,
  });
  const { data: usage } = useQuery({
    queryKey: ['report-usage', preset],
    queryFn: () => apiFetch<UsageReport>(`/reports/usage?preset=${preset}`),
    retry: false,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="דוחות" subtitle="הכנסות ושימוש" />

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              preset === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-border'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="הכנסות ממכירות" value={revenue ? formatILS(revenue.salesRevenueMinor) : '—'} icon={Wallet} />
        <StatCard label="הכנסות משימוש" value={revenue ? formatILS(revenue.usageRevenueMinor) : '—'} icon={TrendingUp} />
        <StatCard label="זיכויים" value={revenue ? formatILS(revenue.refundsMinor) : '—'} icon={Receipt} tone="warning" />
        <StatCard label="שימושים שהסתיימו" value={String(revenue?.sessionsEnded ?? '—')} icon={Clock} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>הכנסות לפי אמצעי תשלום</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue?.paymentsByMethod?.length ? (
              <ul className="flex flex-col gap-2">
                {revenue.paymentsByMethod.map((m) => (
                  <li key={m.method} className="flex justify-between text-sm">
                    <span>{METHOD_LABEL[m.method] ?? m.method}</span>
                    <span className="font-medium">{formatILS(m.totalMinor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">אין נתונים בתקופה זו</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>שימוש</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span>מספר שימושים</span>
              <span className="font-medium">{usage?.sessions ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>סה״כ שעות</span>
              <span className="font-medium">{Math.round((usage?.totalSeconds ?? 0) / 3600)}</span>
            </div>
            <div className="flex justify-between">
              <span>משך ממוצע</span>
              <span className="font-medium">{Math.round((usage?.avgSeconds ?? 0) / 60)} דק׳</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
