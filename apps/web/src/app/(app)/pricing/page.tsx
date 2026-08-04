'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Ticket } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '@/lib/api';
import type { PackageRow, ProductRow } from '@/lib/types';
import { formatILS } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CouponRow {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  isActive: boolean;
  _count?: { redemptions: number };
}
interface NewCoupon {
  code: string;
  discountType: string;
  discountValue: number;
}

const PKG_TYPE: Record<string, string> = {
  TIME: 'זמן',
  MONEY_VALUE: 'ערך כספי',
  PRINT: 'הדפסות',
  SUBSCRIPTION: 'מנוי',
  PUNCH_CARD: 'כרטיסייה',
};
const DISCOUNT_LABEL: Record<string, string> = {
  FIXED: 'סכום קבוע',
  PERCENT: 'אחוז',
  BONUS_TIME: 'זמן בונוס',
  BONUS_PRINT: 'הדפסות בונוס',
};

export default function PricingPage() {
  const queryClient = useQueryClient();
  const [showCoupon, setShowCoupon] = useState(false);

  const { data: packages } = useQuery({ queryKey: ['packages'], queryFn: () => apiFetch<PackageRow[]>('/packages') });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => apiFetch<ProductRow[]>('/products') });
  const { data: coupons } = useQuery({ queryKey: ['coupons'], queryFn: () => apiFetch<CouponRow[]>('/coupons'), retry: false });

  const { register, handleSubmit, reset } = useForm<NewCoupon>({ defaultValues: { discountType: 'PERCENT' } });
  const createCoupon = useMutation({
    mutationFn: (v: NewCoupon) =>
      apiFetch('/coupons', { method: 'POST', body: JSON.stringify({ ...v, discountValue: Number(v.discountValue) }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      reset();
      setShowCoupon(false);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="מוצרים ומחירונים" subtitle="חבילות, מוצרים וקופונים" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>חבילות</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(packages ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{p.name} <Badge className="ms-2">{PKG_TYPE[p.type] ?? p.type}</Badge></span>
                <span className="font-medium">{formatILS(p.prices[0]?.priceMinor ?? 0)}</span>
              </div>
            ))}
            {packages?.length === 0 && <p className="text-sm text-muted-foreground">אין חבילות</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>מוצרים</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(products ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{p.name}</span>
                <span className="font-medium">{formatILS(p.priceMinor)}</span>
              </div>
            ))}
            {products?.length === 0 && <p className="text-sm text-muted-foreground">אין מוצרים</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>קופונים</CardTitle>
          <Button size="sm" onClick={() => setShowCoupon((v) => !v)}>
            <Plus className="h-4 w-4" aria-hidden />
            קופון חדש
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {showCoupon && (
            <form onSubmit={handleSubmit((v) => createCoupon.mutate(v))} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Input placeholder="קוד" {...register('code', { required: true })} />
              <select {...register('discountType')} className="h-11 rounded-md border border-input bg-card px-3 text-sm">
                <option value="PERCENT">אחוז</option>
                <option value="FIXED">סכום קבוע (אגורות)</option>
              </select>
              <Input type="number" placeholder="ערך" {...register('discountValue', { required: true })} />
              <Button type="submit" disabled={createCoupon.isPending}>הוסף</Button>
            </form>
          )}
          {(coupons ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" aria-hidden />
                <b>{c.code}</b> — {DISCOUNT_LABEL[c.discountType] ?? c.discountType}:{' '}
                {c.discountType === 'PERCENT' ? `${c.discountValue}%` : formatILS(c.discountValue)}
              </span>
              <span className="text-muted-foreground">מומש {c._count?.redemptions ?? 0}×</span>
            </div>
          ))}
          {coupons?.length === 0 && <p className="text-sm text-muted-foreground">אין קופונים</p>}
        </CardContent>
      </Card>
    </div>
  );
}
