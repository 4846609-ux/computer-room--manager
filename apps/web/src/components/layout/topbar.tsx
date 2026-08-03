'use client';

import { Bell, Search, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** Top header: global search, branch selector, notifications, profile. */
export function Topbar() {
  return (
    <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4">
      <div className="relative flex-1 max-w-md">
        <Search
          className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          style={{ insetInlineStart: '0.75rem' }}
          aria-hidden
        />
        <Input placeholder="חיפוש גלובלי…" className="ps-9" aria-label="חיפוש" />
      </div>

      <button
        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
        aria-label="בחירת סניף"
      >
        <Building2 className="h-4 w-4" aria-hidden />
        <span>כל הסניפים</span>
      </button>

      <button
        className="relative rounded-md p-2 hover:bg-secondary"
        aria-label="התראות"
      >
        <Bell className="h-5 w-5" aria-hidden />
        <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-status-fault" aria-hidden />
      </button>

      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        aria-label="פרופיל משתמש"
      >
        מנ
      </div>
    </header>
  );
}
