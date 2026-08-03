'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface RevenuePoint {
  day: string;
  revenue: number; // major units for display
}

/** Revenue-by-day area chart. Data is passed in from the dashboard query. */
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(221 83% 53%)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(221 83% 53%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
        <XAxis dataKey="day" reversed tick={{ fontSize: 12 }} />
        <YAxis orientation="right" tick={{ fontSize: 12 }} width={48} />
        <Tooltip
          formatter={(v: number) => [`₪${v.toLocaleString('he-IL')}`, 'הכנסה']}
          labelStyle={{ direction: 'rtl' }}
        />
        <Area type="monotone" dataKey="revenue" stroke="hsl(221 83% 53%)" fill="url(#rev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
