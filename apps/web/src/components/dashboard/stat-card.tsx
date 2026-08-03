import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'text-primary bg-primary/10',
    success: 'text-status-available bg-status-available/10',
    warning: 'text-status-ending bg-status-ending/10',
    danger: 'text-status-fault bg-status-fault/10',
  }[tone];

  return (
    <Card className="flex items-center gap-4 p-4">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', toneClass)}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}
