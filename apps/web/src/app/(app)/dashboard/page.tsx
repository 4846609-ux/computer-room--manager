'use client';

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
import { StatCard } from '@/components/dashboard/stat-card';
import { RevenueChart, type RevenuePoint } from '@/components/dashboard/revenue-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Placeholder shape until the /dashboard/metrics endpoint is wired (Stage 3).
// Values render from the API response; the scaffold shows representative figures.
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
        <StatCard label="סה״כ עמדות" value="24" icon={Monitor} />
        <StatCard label="פעילות כעת" value="11" icon={MonitorPlay} tone="success" />
        <StatCard label="פנויות" value="9" icon={MonitorCheck} tone="success" />
        <StatCard label="מנותקות" value="3" icon={MonitorX} tone="warning" />
        <StatCard label="בתקלה" value="1" icon={TriangleAlert} tone="danger" />
        <StatCard label="לקוחות מחוברים" value="11" icon={Users} />
        <StatCard label="הכנסות היום" value="₪1,810" icon={Wallet} />
        <StatCard label="הדפסות היום" value="142" icon={Printer} />
      </section>

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
              מפת החדר האינטראקטיבית (Floor Plan) תיבנה בשלב ה-MVP.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
