import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Status → color + Hebrew label. Never rely on color alone: text is always shown. */
export const COMPUTER_STATUS: Record<string, { label: string; dot: string }> = {
  AVAILABLE: { label: 'פנוי', dot: 'bg-status-available' },
  IN_USE: { label: 'בשימוש', dot: 'bg-status-inUse' },
  ENDING_SOON: { label: 'עומד להסתיים', dot: 'bg-status-ending' },
  FAULT: { label: 'תקלה', dot: 'bg-status-fault' },
  DISCONNECTED: { label: 'מנותק', dot: 'bg-status-disconnected' },
  RESERVED: { label: 'שמור', dot: 'bg-status-reserved' },
  MAINTENANCE: { label: 'תחזוקה', dot: 'bg-status-maintenance' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = COMPUTER_STATUS[status] ?? { label: status, dot: 'bg-muted-foreground' };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs">
      <span className={cn('h-2 w-2 rounded-full', s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}
