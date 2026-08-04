'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { apiFetch, apiFetchText, ApiError } from '@/lib/api';
import type { CustomerRow, PackageRow, Paginated, ProductRow } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'מזומן' },
  { value: 'CARD', label: 'אשראי' },
  { value: 'WALLET', label: 'ארנק דיגיטלי' },
];

interface CartItem {
  kind: 'PACKAGE' | 'PRODUCT';
  refId: string;
  description: string;
  unitPriceMinor: number;
}

export default function PosPage() {
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [method, setMethod] = useState('CASH');
  const [message, setMessage] = useState<string | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  const { data: packages } = useQuery({
    queryKey: ['packages'],
    queryFn: () => apiFetch<PackageRow[]>('/packages'),
  });
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiFetch<ProductRow[]>('/products'),
  });
  const { data: customers } = useQuery({
    queryKey: ['customers', 'pos'],
    queryFn: () => apiFetch<Paginated<CustomerRow>>('/customers?pageSize=100'),
  });
  const { data: branches } = useQuery({
    queryKey: ['branches', 'pos'],
    queryFn: () => apiFetch<Paginated<{ id: string; name: string }>>('/branches'),
  });

  const total = useMemo(() => cart.reduce((s, i) => s + i.unitPriceMinor, 0), [cart]);
  const branchId = branches?.data?.[0]?.id;

  const sell = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new ApiError('VALIDATION_FAILED', 'לא נמצא סניף', 400);
      return apiFetch<{ id: string }>('/pos/sales', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          branchId,
          customerId: customerId || undefined,
          items: cart.map((i) => ({ kind: i.kind, refId: i.refId })),
          payment: { method, amountMinor: total },
        }),
      });
    },
    onSuccess: (sale) => {
      setMessage('המכירה בוצעה בהצלחה');
      setLastSaleId(sale.id);
      setCart([]);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (e) => setMessage(e instanceof ApiError ? e.message : 'שגיאה במכירה'),
  });

  const needsCustomer = cart.some((i) => i.kind === 'PACKAGE');

  async function printReceipt() {
    if (!lastSaleId) return;
    await apiFetch(`/pos/sales/${lastSaleId}/invoice`, {
      method: 'POST',
      body: JSON.stringify({ type: 'RECEIPT' }),
    }).catch(() => {});
    const html = await apiFetchText(`/pos/sales/${lastSaleId}/receipt`);
    const w = window.open('', '_blank', 'width=460,height=680');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="קופה — מכירה חדשה" subtitle="מכירת חבילות ומוצרים" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>חבילות</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(packages ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setCart((c) => [
                      ...c,
                      { kind: 'PACKAGE', refId: p.id, description: p.name, unitPriceMinor: p.prices[0]?.priceMinor ?? 0 },
                    ])
                  }
                  className="rounded-lg border border-border p-3 text-start hover:bg-secondary"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{formatILS(p.prices[0]?.priceMinor ?? 0)}</p>
                </button>
              ))}
              {packages?.length === 0 && <p className="text-sm text-muted-foreground">אין חבילות</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>מוצרים</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(products ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() =>
                    setCart((c) => [
                      ...c,
                      { kind: 'PRODUCT', refId: p.id, description: p.name, unitPriceMinor: p.priceMinor },
                    ])
                  }
                  className="rounded-lg border border-border p-3 text-start hover:bg-secondary"
                >
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{formatILS(p.priceMinor)}</p>
                </button>
              ))}
              {products?.length === 0 && <p className="text-sm text-muted-foreground">אין מוצרים</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>סל</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">הסל ריק</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {cart.map((i, idx) => (
                  <li key={idx} className="flex items-center justify-between text-sm">
                    <span>{i.description}</span>
                    <span className="flex items-center gap-2">
                      {formatILS(i.unitPriceMinor)}
                      <button
                        onClick={() => setCart((c) => c.filter((_, k) => k !== idx))}
                        className="text-status-fault"
                        aria-label="הסר"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3 font-bold">
              <span>סה״כ</span>
              <span>{formatILS(total)}</span>
            </div>

            <label className="text-sm font-medium" htmlFor="customer">
              לקוח {needsCustomer && <span className="text-status-fault">*</span>}
            </label>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-11 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">— ללא / אורח —</option>
              {customers?.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} (#{c.customerNumber})
                </option>
              ))}
            </select>

            <label className="text-sm font-medium" htmlFor="method">אמצעי תשלום</label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-11 rounded-md border border-input bg-card px-3 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {message && <p className="rounded-md bg-secondary px-3 py-2 text-sm">{message}</p>}

            <Button
              disabled={cart.length === 0 || (needsCustomer && !customerId) || sell.isPending}
              onClick={() => sell.mutate()}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              {sell.isPending ? 'מבצע…' : `תשלום ${formatILS(total)}`}
            </Button>

            {lastSaleId && (
              <Button variant="outline" onClick={printReceipt}>
                הפקת קבלה למכירה האחרונה
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
