'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Monitor,
  MonitorPlay,
  MonitorCheck,
  MonitorX,
  TriangleAlert,
  Users,
  Wallet,
  Printer,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { DashboardMetrics } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { StatCard } from '@/components/dashboard/stat-card';
import { RevenueChart, type RevenuePoint } from '@/components/dashboard/revenue-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Weekly revenue series is a placeholder until the reporting endpoint lands (Stage 4).
const revenueSeries: RevenuePoint[] = [
  { day: "א'", revenue: 1240 },
  { day: "ב'", revenue: 980 },
  { day: "ג'", revenue: 1560 },
  { day: "ד'", revenue: 1320 },
  { day: "ה'", revenue: 1810 },
  { day: "ו'", revenue: 640 },
  { day: "ש'", revenue: 0 },
];

const STATUS_LEGEND = [
  { label: 'פנוי', className: 'bg-status-available' },
  { label: 'בשימוש', className: 'bg-status-inUse' },
  { label: 'עומד להסתיים', className: 'bg-status-ending' },
  { label: 'תקלה', className: 'bg-status-fault' },
  { label: 'מנותק', className: 'bg-status-disconnected' },
  { label: 'שמור', className: 'bg-status-reserved' },
  { label: 'תחזוקה', className: 'bg-status-maintenance' },
];

export default function DashboardPage() {
  const { data: m } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: () => apiFetch<DashboardMetrics>('/dashboard/metrics'),
    refetchInterval: 20_000,
    retry: false,
  });

  const c = m?.computers;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">לוח בקרה</h1>
        <p className="text-sm text-muted-foreground">מבט על כלל הפעילות בזמן אמת</p>
      </div>

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-label="מדדים עליונים"
      >
        <StatCard label="סה״כ עמדות" value={String(c?.total ?? '—')} icon={Monitor} />
        <StatCard label="פעילות כעת" value={String(c?.inUse ?? '—')} icon={MonitorPlay} tone="success" />
        <StatCard label="פנויות" value={String(c?.available ?? '—')} icon={MonitorCheck} tone="success" />
        <StatCard label="מנותקות" value={String(c?.disconnected ?? '—')} icon={MonitorX} tone="warning" />
        <StatCard label="בתקלה" value={String(c?.fault ?? '—')} icon={TriangleAlert} tone="danger" />
        <StatCard label="לקוחות מחוברים" value={String(m?.connectedCustomers ?? '—')} icon={Users} />
        <StatCard
          label="הכנסות היום"
          value={m ? formatILS(m.revenueTodayMinor) : '—'}
          icon={Wallet}
        />
        <StatCard label="הדפסות היום" value={String(m?.printsToday ?? '—')} icon={Printer} />
      </section>

      {!m && (
        <p className="rounded-md bg-secondary px-4 py-2 text-sm text-muted-foreground">
          המדדים נטענים מהשרת. אם הם אינם מופיעים — התחבר מחדש וודא שה-API פועל.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>הכנסות לפי יום</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>מקרא מצב עמדות</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {STATUS_LEGEND.map((s) => (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  <span className={`h-3.5 w-3.5 rounded-full ${s.className}`} aria-hidden />
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              מפת החדר האינטראקטיבית (Floor Plan) תיבנה בשלב הבא.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
