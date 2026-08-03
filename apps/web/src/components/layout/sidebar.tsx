'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Monitor } from 'lucide-react';
import { NAV_ITEMS } from './nav-items';
import { cn } from '@/lib/utils';

/** Right-side navigation for the admin/manager console (RTL). */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-e border-border bg-card md:flex">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Monitor className="h-5 w-5" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold">Room Manager</p>
          <p className="text-xs text-muted-foreground">ניהול חדרי מחשבים</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="ניווט ראשי">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                    active
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground hover:bg-secondary',
                  )}
                >
                  <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
