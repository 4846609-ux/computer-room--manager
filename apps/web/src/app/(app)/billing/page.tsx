'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { DataTable, type Column } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PaymentRow {
  id: string;
  method: string;
  status: string;
  amountMinor: number;
  cardLast4: string | null;
  createdAt: string;
  sale?: { customer?: { fullName: string } | null } | null;
}
interface SubscriptionRow {
  id: string;
  status: string;
  priceMinor: number;
  interval: string;
  autoRenew: boolean;
  externalRef: string | null;
  currentPeriodEnd: string;
  customer?: { fullName: string } | null;
  package?: { name: string } | null;
}

const METHOD: Record<string, string> = {
  CASH: 'מזומן', CARD: 'אשראי', BANK_TRANSFER: 'העברה', CHECK: 'המחאה',
  WALLET: 'ארנק', CREDIT: 'חיוב חשבון', VOUCHER: 'שובר', MIXED: 'משולב', SELF_SERVICE: 'שירות עצמי',
};
const PAY_STATUS: Record<string, string> = { PENDING: 'ממתין', COMPLETED: 'הושלם', FAILED: 'נכשל', REFUNDED: 'זוכה' };
const SUB_STATUS: Record<string, string> = {
  ACTIVE: 'פעיל', PAUSED: 'מושהה', CANCELLED: 'בוטל', EXPIRED: 'פג', PAST_DUE: 'בפיגור',
};
const INTERVAL: Record<string, string> = { WEEKLY: 'שבועי', MONTHLY: 'חודשי', YEARLY: 'שנתי' };

export default function BillingPage() {
  const { data: payments, isLoading: pl } = useQuery({
    queryKey: ['payments'],
    queryFn: () => apiFetch<PaymentRow[]>('/pos/payments'),
  });
  const { data: subs, isLoading: sl } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => apiFetch<SubscriptionRow[]>('/subscriptions'),
    retry: false,
  });

  const paymentCols: Column<PaymentRow>[] = [
    { key: 'createdAt', header: 'תאריך', render: (r) => new Date(r.createdAt).toLocaleString('he-IL') },
    { key: 'customer', header: 'לקוח', render: (r) => r.sale?.customer?.fullName ?? '—' },
    {
      key: 'method',
      header: 'אמצעי',
      render: (r) => `${METHOD[r.method] ?? r.method}${r.cardLast4 ? ` •••• ${r.cardLast4}` : ''}`,
    },
    { key: 'amount', header: 'סכום', render: (r) => formatILS(r.amountMinor) },
    { key: 'status', header: 'סטטוס', render: (r) => <Badge>{PAY_STATUS[r.status] ?? r.status}</Badge> },
  ];

  const subCols: Column<SubscriptionRow>[] = [
    { key: 'customer', header: 'לקוח', render: (r) => r.customer?.fullName ?? '—' },
    { key: 'package', header: 'מנוי', render: (r) => r.package?.name ?? '—' },
    { key: 'interval', header: 'מחזור', render: (r) => INTERVAL[r.interval] ?? r.interval },
    { key: 'price', header: 'סכום', render: (r) => formatILS(r.priceMinor) },
    {
      key: 'billing',
      header: 'חיוב',
      render: (r) => (r.externalRef ? `נדרים (${r.externalRef})` : r.autoRenew ? 'פנימי' : 'ידני'),
    },
    {
      key: 'next',
      header: 'חידוש הבא',
      render: (r) => new Date(r.currentPeriodEnd).toLocaleDateString('he-IL'),
    },
    { key: 'status', header: 'סטטוס', render: (r) => <Badge>{SUB_STATUS[r.status] ?? r.status}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="מנויים ואשראי" subtitle="תשלומים והוראות קבע" />

      <Card>
        <CardHeader><CardTitle>מנויים פעילים</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={subCols} rows={subs ?? []} isLoading={sl} emptyText="אין מנויים" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>תשלומים אחרונים</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={paymentCols} rows={payments ?? []} isLoading={pl} emptyText="אין תשלומים" />
        </CardContent>
      </Card>
    </div>
  );
}
