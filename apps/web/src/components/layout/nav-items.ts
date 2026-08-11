import {
  LayoutDashboard,
  MonitorSmartphone,
  Server,
  Users,
  Clock,
  CalendarClock,
  Package,
  Printer,
  Wallet,
  CreditCard,
  Wrench,
  UserCog,
  ShieldCheck,
  BarChart3,
  Bell,
  Building2,
  ScrollText,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Main navigation, per spec §כ״ה (recommended menu structure). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'לוח בקרה', href: '/dashboard', icon: LayoutDashboard },
  { label: 'חדרים בזמן אמת', href: '/floor', icon: Server },
  { label: 'מחשבים', href: '/computers', icon: MonitorSmartphone },
  { label: 'לקוחות', href: '/customers', icon: Users },
  { label: 'רמות משתמש', href: '/access-profiles', icon: ShieldCheck },
  { label: 'שימושים', href: '/sessions', icon: Clock },
  { label: 'הזמנות', href: '/reservations', icon: CalendarClock },
  { label: 'מוצרים ומחירונים', href: '/pricing', icon: Package },
  { label: 'הדפסות', href: '/printing', icon: Printer },
  { label: 'קופה', href: '/pos', icon: Wallet },
  { label: 'מנויים ואשראי', href: '/billing', icon: CreditCard },
  { label: 'תחזוקה', href: '/maintenance', icon: Wrench },
  { label: 'עובדים', href: '/employees', icon: UserCog },
  { label: 'דוחות', href: '/reports', icon: BarChart3 },
  { label: 'הודעות', href: '/notifications', icon: Bell },
  { label: 'סניפים', href: '/branches', icon: Building2 },
  { label: 'יומן פעילות', href: '/audit', icon: ScrollText },
  { label: 'הגדרות', href: '/settings', icon: Settings },
  { label: 'תמיכה', href: '/support', icon: LifeBuoy },
];
